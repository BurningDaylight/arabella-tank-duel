for f in tank-duel.html chopper-duel.html; do
  if grep -q 'id = .fsBtn.' "$f"; then echo "$f: уже есть"; continue; fi
  cp "$f" "$f.bak"
  awk 'FNR==NR { s = s $0 "\n"; next } /<\/body>/ { printf "%s", s } { print }' fullscreen.html "$f.bak" > "$f"
  echo "$f: добавлено"
done
