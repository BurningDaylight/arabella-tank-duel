/* Shared Google Analytics 4 (gtag) block for all games. No build step, no dependencies.
   Page:  <script src="analytics.js" data-game="star-melee" data-version="2.5.0"></script>
   Game:  GA.start({mode:'ai', difficulty:'hard'}); ... GA.end(GA.RESULT.WIN);
          const MELEE_EVENT = GA.defineEvents({SHIP_PICK:'melee_ship_pick'});  GA.event(MELEE_EVENT.SHIP_PICK, {ship:'siren'});
   Nothing is sent with the placeholder id, on file://, with ?noga or ?watch, or when localStorage ga_off = '1'.
   Outside prod: debug_mode (DebugView only, excluded by the Developer traffic filter) and a console log of every event. */
(function () {
  'use strict';
  var CONFIG = {
    id: 'G-XXXXXXXXXX',                       // GA4 measurement id; the placeholder means "log only"
    prodHosts: ['burningdaylight.github.io'], // replace with the real prod domain later: old hosts become staging
    localHosts: /^(localhost|127(\.\d+){3}|\[::1\]|0\.0\.0\.0|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2})$/,
    consent: 'none',                          // 'none' | 'banner' (vanilla-cookieconsent v3 from CDN, Consent Mode v2)
  };

  var EVENT = Object.freeze({LEVEL_START:'level_start', LEVEL_END:'level_end'});
  var RESULT = Object.freeze({WIN:'win', LOSE:'lose', DRAW:'draw', PVP:'pvp', QUIT:'quit'});
  var NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
  var known = {}, results = {};
  Object.keys(EVENT).forEach(function (k) { known[EVENT[k]] = true; });
  Object.keys(RESULT).forEach(function (k) { results[RESULT[k]] = true; });

  var script = document.currentScript;
  var game = (script && script.dataset.game) || (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '');
  var version = (script && script.dataset.version) || '';
  var host = location.hostname;
  var env = location.protocol === 'file:' ? 'file'
    : CONFIG.prodHosts.indexOf(host) >= 0 ? 'prod'
    : CONFIG.localHosts.test(host) ? 'local' : 'staging';
  var flagOff = false;
  try { flagOff = window.localStorage.getItem('ga_off') === '1'; } catch (_) {}
  var placeholder = !/^G-[A-Z0-9]+$/.test(CONFIG.id) || /^G-X+$/.test(CONFIG.id);
  var off = placeholder || env === 'file' || flagOff || /[?&](noga|watch)\b/.test(location.search);
  var log = env !== 'prod';
  var common = {game:game, env:env, game_version:version};

  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }

  if (!off) {
    gtag('consent', 'default', {
      analytics_storage: CONFIG.consent === 'banner' ? 'denied' : 'granted',
      ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied',
    });
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + CONFIG.id;
    document.head.appendChild(s);
    gtag('js', new Date());
    var cfg = Object.assign({allow_google_signals:false, allow_ad_personalization_signals:false}, common);
    if (env !== 'prod') cfg.debug_mode = true;   // presence of the key turns debug on, so only add it outside prod
    gtag('config', CONFIG.id, cfg);
    if (CONFIG.consent === 'banner') loadBanner();
  }
  if (log) console.info('[ga] ' + (off ? 'off (' + (placeholder ? 'placeholder id' : env === 'file' ? 'file://' : 'disabled') + ')' : 'on') + ' · game=' + game + ' · env=' + env);

  function clean(o){ var r = {}; for (var k in o) if (o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k]; return r; }
  function send(name, params){
    if (log && !known[name]) console.warn('[ga] event "' + name + '" is not declared in GA.EVENT or GA.defineEvents()');
    var p = clean(Object.assign({}, common, params || {}));
    if (log) console.debug('[ga]', name, p);
    if (!off) gtag('event', name, p);
  }

  var level = null;   // the running game: start time and start params (carried into level_end)
  var GA = {
    EVENT:EVENT, RESULT:RESULT, env:env, game:game,
    // declare game-specific events: returns a frozen enum, names validated and registered
    defineEvents: function (en) {
      Object.keys(en).forEach(function (k) {
        if (!NAME_RE.test(en[k])) console.warn('[ga] bad event name "' + en[k] + '": letters, digits, _ ; max 40; starts with a letter');
        known[en[k]] = true;
      });
      return Object.freeze(en);
    },
    event: send,
    // a new start while a game is running closes the previous one as quit
    start: function (params) {
      if (level) GA.end(RESULT.QUIT, {reason:'restart'});
      level = {t0:Date.now(), params:params || {}};
      send(EVENT.LEVEL_START, level.params);
    },
    end: function (result, params) {
      if (!results[result]) console.warn('[ga] unknown result "' + result + '": use GA.RESULT');
      var p = Object.assign({}, level ? level.params : {}, {result:result, success:result === RESULT.WIN,
        duration_sec: level ? Math.round((Date.now() - level.t0) / 1000) : undefined}, params || {});
      level = null;
      send(EVENT.LEVEL_END, p);
    },
    running: function () { return !!level; },
  };
  // leaving the page mid-game counts as quit; beacon transport survives the unload
  window.addEventListener('pagehide', function () { if (level) GA.end(RESULT.QUIT, {reason:'leave', transport_type:'beacon'}); });
  window.GA = GA;

  // optional consent banner (CONFIG.consent = 'banner'): vanilla-cookieconsent v3, Russian texts
  function loadBanner(){
    var css = document.createElement('link'); css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/vanilla-cookieconsent@3.1.0/dist/cookieconsent.css'; document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'https://cdn.jsdelivr.net/npm/vanilla-cookieconsent@3.1.0/dist/cookieconsent.umd.js';
    js.onload = function () {
      var apply = function () { gtag('consent', 'update', {analytics_storage: window.CookieConsent.acceptedCategory('analytics') ? 'granted' : 'denied'}); };
      window.CookieConsent.run({
        categories: {necessary:{enabled:true, readOnly:true}, analytics:{}},
        onConsent: apply, onChange: apply,
        language: {default:'ru', translations:{ru:{
          consentModal: {title:'Немного статистики?', description:'Мы считаем, сколько партий сыграно и чем они закончились. Без рекламы и личных данных.',
            acceptAllBtn:'Можно', acceptNecessaryBtn:'Не надо', showPreferencesBtn:'Подробнее'},
          preferencesModal: {title:'Настройки', acceptAllBtn:'Разрешить всё', acceptNecessaryBtn:'Только необходимое', savePreferencesBtn:'Сохранить',
            sections:[{title:'Необходимые', description:'Настройки игр в вашем браузере.', linkedCategory:'necessary'},
                      {title:'Статистика', description:'Google Analytics: число партий, результаты, длительность.', linkedCategory:'analytics'}]},
        }}},
      });
    };
    document.head.appendChild(js);
  }
})();
