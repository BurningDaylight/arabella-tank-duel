#!/usr/bin/env bash
# get-sounds.sh — скачивает CC0-звуки и собирает банки для Scorched Earth
# Нужны: curl, unzip, ffmpeg (с libvorbis), ffprobe, awk
set -euo pipefail
export LC_ALL=C
cd "$(dirname "$0")"

OUT=sounds          # готовые файлы — рядом с игрой
WORK=.sounds-work   # кэш архивов и временные файлы
EXTRA=sounds-extra  # свои звуки: sounds-extra/hurt/*.wav и т.п. — попадут в банк первыми
TYPES=(shot boom nuke hurt death deflect shield dirt win gun nitro coin pick clash march)
declare -A LIMIT=([shot]=6 [boom]=6 [nuke]=3 [hurt]=8 [death]=6 [deflect]=4 [shield]=3 [dirt]=4 [win]=3 [gun]=5 [nitro]=3 [coin]=3 [pick]=3 [clash]=6 [march]=4)
declare -A COUNT=()

for c in curl unzip ffmpeg ffprobe awk; do
  command -v "$c" >/dev/null || { echo "Не найдено: $c  (sudo apt install curl unzip ffmpeg)"; exit 1; }
done
mkdir -p "$OUT" "$WORK"

warn(){ echo "  ! $*" >&2; }

fetch(){ # имя url
  local name="$1" url="$2" zip="$WORK/$1.zip"
  [ -n "$url" ] || { warn "нет ссылки для $name"; return 1; }
  if [ ! -s "$zip" ]; then
    echo "↓ $name"
    curl -fL --retry 3 -A "Mozilla/5.0" -o "$zip" "$url" || { rm -f "$zip"; warn "не скачался $name"; return 1; }
  fi
  chmod -R u+w "$WORK/$name" 2>/dev/null; rm -rf "$WORK/$name"; mkdir -p "$WORK/$name"
  unzip -qo "$zip" -d "$WORK/$name" || { warn "не распаковался $name"; return 1; }
  chmod -R u+w "$WORK/$name" 2>/dev/null
}
kenney(){ # slug пака -> ссылка на zip со страницы (в ссылке меняющийся хэш)
  curl -fsL -A "Mozilla/5.0" "https://kenney.nl/assets/$1" \
    | grep -oE "https://kenney\.nl/media/pages/assets/$1/[^\"' ]+\.zip" | head -1 || true
}
list_audio(){ # все звуковые файлы в папке
  [ -d "$1" ] || return 0
  find "$1" -type f \( -iname '*.wav' -o -iname '*.ogg' -o -iname '*.mp3' -o -iname '*.flac' \) \
    | grep -viE 'preview|loop' | sort -V || true
}
dur(){ ffprobe -v error -show_entries format=duration -of csv=p=0 "$1" 2>/dev/null | head -1; }

process(){ # вход выход макс_длина пик_dB [доп_фильтр]
  local in="$1" out="$2" max="$3" peak="$4" fx="${5:-}" tmp="$WORK/tmp.wav"
  local f="aresample=32000"
  [ -n "$fx" ] && f="$f,$fx"
  # срезаем тишину в начале и в конце
  f="$f,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
  ffmpeg -nostdin -v error -y -i "$in" -ac 1 -af "$f" -ar 32000 "$tmp" || return 1
  local d len fst mx gain
  d=$(dur "$tmp"); [ -n "$d" ] || return 1
  awk -v d="$d" 'BEGIN{exit !(d>=0.05)}' || return 1
  len=$(awk -v d="$d" -v m="$max" 'BEGIN{printf "%.3f", (d<m)?d:m}')
  fst=$(awk -v l="$len" 'BEGIN{s=l-0.12; if(s<0)s=0; printf "%.3f", s}')
  # выравнивание по пику: чтобы все звуки были одной громкости
  mx=$(ffmpeg -nostdin -hide_banner -i "$tmp" -af volumedetect -f null - 2>&1 \
        | sed -n 's/.*max_volume: \(-\{0,1\}[0-9.]*\) dB.*/\1/p' | tail -1)
  gain=$(awk -v m="${mx:-0}" -v p="$peak" 'BEGIN{printf "%.2f", p-m}')
  ffmpeg -nostdin -v error -y -i "$tmp" -af "atrim=end=$len,afade=t=out:st=$fst:d=0.12,volume=${gain}dB" \
    -c:a libvorbis -q:a 4 "$out"
}
add(){ # тип файл макс пик [фильтр]
  local t="$1" n=$(( ${COUNT[$1]:-0} + 1 ))
  [ "$n" -le "${LIMIT[$t]}" ] || return 0
  if process "$2" "$OUT/$t$n.ogg" "$3" "$4" "${5:-}"; then
    COUNT[$t]=$n; echo "  $t$n.ogg  ← $(basename "$2")"
  else
    warn "пропущен $(basename "$2")"
  fi
  return 0
}
pick(){ # тип макс пик фильтр regex пак...   — берёт файлы, чьё имя подходит под regex
  local t="$1" max="$2" peak="$3" fx="$4" re="$5" f b; shift 5
  shopt -s nocasematch
  while IFS= read -r f; do
    b=$(basename "$f")
    if [[ $b =~ $re ]]; then add "$t" "$f" "$max" "$peak" "$fx"; fi
  done < <(for p in "$@"; do list_audio "$WORK/$p"; done)
  shopt -u nocasematch
}
by_duration(){ # пак -> «длительность<TAB>файл», от коротких к длинным
  list_audio "$WORK/$1" | while IFS= read -r f; do printf '%s\t%s\n' "$(dur "$f")" "$f"; done | sort -n
}

echo "== Скачиваю паки =="
fetch bangs     "https://opengameart.org/sites/default/files/25-CC0-bang-sfx.zip"          || true
fetch creature  "https://opengameart.org/sites/default/files/80-CC0-creature-SFX_0.zip"    || true
fetch deathvox  "https://opengameart.org/sites/default/files/exewinDeathSoundsPack.zip"    || true
fetch retro     "https://opengameart.org/sites/default/files/50-CC0-retro-synth-SFX.zip"   || true
fetch k-impact  "$(kenney impact-sounds)"  || true
fetch k-scifi   "$(kenney sci-fi-sounds)"  || true
fetch k-digital "$(kenney digital-audio)"  || true
fetch k-jingles "$(kenney music-jingles)"  || true
fetch k-rpg     "$(kenney rpg-audio)"      || true

echo "== Собираю банки =="
for t in "${TYPES[@]}"; do rm -f "$OUT/$t"[0-9]*.ogg; done

# 0) свои звуки — первыми
for t in "${TYPES[@]}"; do
  [ -d "$EXTRA/$t" ] || continue
  while IFS= read -r f; do add "$t" "$f" 4 -3; done < <(list_audio "$EXTRA/$t")
done

# 1) хлопки: короткие — выстрел, длинные — ядерка (ниже тоном и с эхом), остальные — взрыв
mapfile -t BANGS < <(by_duration bangs | cut -f2-)
nb=${#BANGS[@]}
NUKE_FX="asetrate=32000*0.62,aresample=32000,aecho=0.8:0.6:180|420:0.35|0.2,lowpass=f=4000"
for ((i=0; i<nb && i<6; i++));          do add shot "${BANGS[i]}" 0.9 -3; done
for ((i=nb-1; i>=nb-3 && i>=6; i--));   do add nuke "${BANGS[i]}" 3.5 -1 "$NUKE_FX"; done
for ((i=6; i<nb-3; i++));               do add boom "${BANGS[i]}" 1.8 -1; done

# 2) «ох» при ранении и стоны при гибели
pick hurt 0.7 -4 "" 'hurt|grunt|ooh|pain' creature
while IFS=$'\t' read -r d f; do
  if awk -v d="${d:-0}" 'BEGIN{exit !(d<0.8)}'; then add hurt "$f" 0.7 -4; else add death "$f" 1.8 -3; fi
done < <(by_duration deathvox)
pick death 1.8 -3 "" 'scream|death|die|dying' creature

# 3) дефлектор, щит, земля, победа
pick deflect 0.7 -6 "" 'phaser|zap|laser'      k-digital k-scifi retro
pick shield  1.2 -6 "" 'force|shield|power'    k-scifi k-digital retro
pick dirt    0.7 -3 "lowpass=f=2500" 'soft' k-impact
pick dirt    0.7 -3 "lowpass=f=2500" 'mining|punch|plank' k-impact
pick win     3.5 -6 "" 'nes|8.?bit'            k-jingles
[ "${COUNT[win]:-0}" -gt 0 ] || pick win 3.5 -6 "" 'jingle|coin|win' k-jingles retro

# 4) звуки для Звёздной схватки, Грязевого Кубка и Властителей
pick gun   0.25 -8  "" 'laser|zap|shoot'              k-scifi k-digital retro
pick nitro 0.9  -5  "" 'thruster|whoosh|jet|engine'   k-scifi k-digital
pick coin  0.5  -6  "" 'coin'                          k-rpg retro k-digital
pick pick  0.6  -6  "" 'powerup|power_up|pep|pickup'   k-digital retro
pick clash 0.5  -5  "" 'metal|sword|blade|clash|chop'  k-rpg k-impact
pick march 0.35 -10 "" 'footstep|step'                 k-rpg k-impact

rm -f "$WORK/tmp.wav"
cat > "$OUT/CREDITS.txt" <<'TXT'
Все звуки — CC0 (public domain), указание авторов не обязательно, но приятно:
- "25 CC0 bang / firework SFX", "80 CC0 creature SFX", "50 CC0 retro / synth SFX" — rubberduck, opengameart.org
- "Death sounds" — Exewin, opengameart.org
- Impact Sounds, Sci-fi Sounds, Digital Audio, Music Jingles — Kenney, kenney.nl
TXT

echo "== Итого =="
for t in "${TYPES[@]}"; do printf '  %-8s %s\n' "$t" "${COUNT[$t]:-0 — будет синтез}"; done
echo "Готово: папка $OUT/ рядом с игрой. Перезапустите игру."
