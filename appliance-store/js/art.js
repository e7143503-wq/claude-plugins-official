/* Иллюстрации техники: каждая функция рисует SVG в поле 200×200.
   Цвет корпуса задаётся палитрой товара (white, silver, black, red, beige). */
(function () {
  'use strict';

  var PAL = {
    white:  { body: '#F7F8FA', edge: '#A9B3BD', mid: '#E1E6EB', dark: '#3B4550', glass: '#26313C' },
    silver: { body: '#D5DBE0', edge: '#8A96A2', mid: '#BCC5CD', dark: '#3B4550', glass: '#26313C' },
    black:  { body: '#2E353C', edge: '#12161A', mid: '#46505A', dark: '#A9B3BD', glass: '#141A20' },
    red:    { body: '#CC3A2E', edge: '#87231A', mid: '#E2675C', dark: '#3A1511', glass: '#26313C' },
    beige:  { body: '#ECE2CF', edge: '#B2A184', mid: '#DCCDB2', dark: '#4C4130', glass: '#26313C' }
  };
  var LED = '#FF8A3D';
  var SHADOW = 'rgba(10,20,30,.16)';
  var SHINE = 'rgba(255,255,255,.3)';
  var WATER = '#8EC1E3';

  function sh(cx, cy, rx) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="6" fill="' + SHADOW + '"/>';
  }
  function led(x, y, text, size) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="' +
      (size || 9) + '" font-weight="700" fill="' + LED + '">' + text + '</text>';
  }

  var DRAW = {
    fridge: function (c) {
      return sh(100, 188, 50) +
        '<rect x="56" y="12" width="88" height="174" rx="9" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M56 116h88" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<rect x="127" y="30" width="7" height="46" rx="3.5" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="127" y="128" width="7" height="34" rx="3.5" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="68" y="26" width="34" height="15" rx="3" fill="' + c.glass + '"/>' + led(85, 37, '+4°', 10) +
        '<path d="M64 52v56M64 126v50" stroke="' + SHINE + '" stroke-width="4" stroke-linecap="round"/>';
    },
    fridge2: function (c) {
      return sh(100, 188, 64) +
        '<rect x="40" y="12" width="120" height="174" rx="9" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M100 12v174" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<rect x="89" y="50" width="6" height="70" rx="3" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="105" y="50" width="6" height="70" rx="3" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="54" y="28" width="28" height="13" rx="3" fill="' + c.glass + '"/>' + led(68, 37.5, '−18°', 8) +
        '<rect x="54" y="52" width="28" height="38" rx="4" fill="' + c.glass + '"/>' +
        '<path d="M64 60v20" stroke="' + WATER + '" stroke-width="3" stroke-linecap="round" opacity=".7"/>' +
        '<path d="M48 100v76M116 30v146" stroke="' + SHINE + '" stroke-width="4" stroke-linecap="round"/>';
    },
    washer: function (c) {
      return sh(100, 186, 56) +
        '<rect x="44" y="30" width="112" height="154" rx="9" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M44 62h112" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<rect x="54" y="40" width="34" height="13" rx="2.5" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="98" y="40" width="30" height="13" rx="2" fill="' + c.glass + '"/>' + led(113, 49.5, '1:05', 8) +
        '<circle cx="142" cy="46.5" r="7" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<circle cx="100" cy="122" r="42" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="3"/>' +
        '<circle cx="100" cy="122" r="31" fill="' + c.glass + '"/>' +
        '<path d="M74 134q13-9 26 0t26 0" stroke="' + WATER + '" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>' +
        '<path d="M80 110a24 24 0 0 1 18-16" stroke="' + SHINE + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
    },
    dishwasher: function (c) {
      return sh(100, 186, 54) +
        '<rect x="46" y="30" width="108" height="154" rx="7" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M46 56V37a7 7 0 0 1 7-7h94a7 7 0 0 1 7 7v19Z" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<circle cx="60" cy="43" r="3.2" fill="' + c.dark + '"/><circle cx="72" cy="43" r="3.2" fill="' + c.dark + '"/><circle cx="84" cy="43" r="3.2" fill="' + c.dark + '"/>' +
        '<rect x="112" y="36" width="32" height="14" rx="2" fill="' + c.glass + '"/>' + led(128, 46, '2:40', 8.5) +
        '<rect x="70" y="66" width="60" height="7" rx="3.5" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<path d="M54 84v90" stroke="' + SHINE + '" stroke-width="4" stroke-linecap="round"/>';
    },
    microwave: function (c) {
      return sh(100, 166, 76) +
        '<rect x="22" y="58" width="156" height="104" rx="9" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<rect x="34" y="72" width="100" height="76" rx="5" fill="' + c.glass + '"/>' +
        '<path d="M46 134 72 84" stroke="' + SHINE + '" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M142 66v88" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="148" y="73" width="24" height="12" rx="2" fill="' + c.glass + '"/>' + led(160, 82, '0:45', 7) +
        '<circle cx="160" cy="106" r="8" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<path d="M160 100v6" stroke="' + c.dark + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="160" cy="132" r="6" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>';
    },
    oven: function (c) {
      return sh(100, 186, 62) +
        '<rect x="38" y="26" width="124" height="158" rx="7" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M38 58V33a7 7 0 0 1 7-7h110a7 7 0 0 1 7 7v25Z" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<circle cx="58" cy="42" r="8" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="1.5"/><path d="M58 36v6" stroke="' + c.dark + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="142" cy="42" r="8" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="1.5"/><path d="M142 36v6" stroke="' + c.dark + '" stroke-width="2" stroke-linecap="round"/>' +
        '<rect x="80" y="35" width="40" height="15" rx="2" fill="' + c.glass + '"/>' + led(100, 46, '180°', 9.5) +
        '<rect x="58" y="68" width="84" height="7" rx="3.5" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="54" y="86" width="92" height="82" rx="6" fill="' + c.glass + '"/>' +
        '<path d="M66 156h68" stroke="' + LED + '" stroke-width="3" stroke-linecap="round" opacity=".6"/>' +
        '<path d="M64 146 84 98" stroke="' + SHINE + '" stroke-width="5" stroke-linecap="round"/>';
    },
    hob: function () {
      var zones = [[62, 86, 26, true], [62, 134, 15], [138, 82, 18], [138, 126, 23]];
      var s = '<rect x="20" y="46" width="160" height="116" rx="8" fill="#161C22" stroke="#5A6570" stroke-width="3"/>';
      zones.forEach(function (z) {
        s += '<circle cx="' + z[0] + '" cy="' + z[1] + '" r="' + z[2] + '" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.5"/>' +
             '<circle cx="' + z[0] + '" cy="' + z[1] + '" r="' + (z[2] - 7) + '" fill="none" stroke="' + (z[3] ? LED : 'rgba(255,255,255,.16)') + '" stroke-width="' + (z[3] ? 3 : 1.5) + '" opacity="' + (z[3] ? '.85' : '1') + '"/>';
      });
      for (var i = 0; i < 5; i++) s += '<circle cx="' + (84 + i * 8) + '" cy="152" r="2" fill="rgba(255,255,255,.45)"/>';
      return s + '<path d="M30 58h40" stroke="rgba(255,255,255,.12)" stroke-width="4" stroke-linecap="round"/>';
    },
    vacuum: function (c) {
      return sh(112, 182, 74) +
        '<rect x="16" y="168" width="46" height="12" rx="4" fill="#2B3239"/>' +
        '<path d="M42 168 70 72" stroke="#9AA5B1" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M70 72l6-18" stroke="' + c.body + '" stroke-width="11" stroke-linecap="round"/>' +
        '<path d="M76 58c34-20 56 30 30 72" stroke="#3B4550" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<path d="M94 170c-4-36 18-56 46-56s44 22 42 56Z" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<ellipse cx="140" cy="146" rx="22" ry="14" fill="rgba(142,193,227,.4)" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<circle cx="164" cy="170" r="12" fill="#2B3239" stroke="#12161A" stroke-width="2"/><circle cx="164" cy="170" r="4" fill="#8A96A2"/>' +
        '<path d="M112 128c8-6 18-8 28-8" stroke="' + SHINE + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    },
    robot: function (c) {
      return sh(100, 154, 76) +
        '<ellipse cx="100" cy="128" rx="72" ry="26" fill="' + c.edge + '"/>' +
        '<rect x="28" y="108" width="144" height="20" fill="' + c.edge + '"/>' +
        '<path d="M28 118a72 26 0 0 0 144 0" stroke="' + c.mid + '" stroke-width="3" fill="none"/>' +
        '<ellipse cx="100" cy="108" rx="72" ry="26" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<ellipse cx="100" cy="98" rx="20" ry="8" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<rect x="80" y="91" width="40" height="7" fill="' + c.mid + '"/>' +
        '<ellipse cx="100" cy="91" rx="20" ry="7" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<ellipse cx="100" cy="118" rx="8" ry="3" fill="' + LED + '"/>' +
        '<path d="M44 102a60 18 0 0 1 34-14" stroke="' + SHINE + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    },
    kettle: function (c) {
      return sh(98, 182, 50) +
        '<rect x="54" y="164" width="88" height="14" rx="5" fill="' + c.dark + '"/>' +
        '<path d="M126 76c34 0 36 64 6 74" fill="none" stroke="' + c.edge + '" stroke-width="12" stroke-linecap="round"/>' +
        '<path d="M126 76c34 0 36 64 6 74" fill="none" stroke="' + c.body + '" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M68 86 44 66q-5-3-2 4l22 34Z" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M62 164 70 72q2-14 16-14h24q14 0 16 14l8 92Z" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M78 58q20-12 40 0Z" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<rect x="92" y="45" width="12" height="7" rx="3" fill="' + c.dark + '"/>' +
        '<rect x="80" y="88" width="9" height="62" rx="4.5" fill="' + WATER + '" opacity=".6" stroke="' + c.edge + '" stroke-width="1"/>' +
        '<path d="M110 76l4 74" stroke="' + SHINE + '" stroke-width="5" stroke-linecap="round"/>' +
        '<circle cx="132" cy="157" r="3" fill="' + LED + '"/>';
    },
    coffee: function (c) {
      return sh(100, 186, 56) +
        '<rect x="48" y="24" width="104" height="160" rx="10" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M48 64V34a10 10 0 0 1 10-10h84a10 10 0 0 1 10 10v30Z" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<rect x="60" y="36" width="44" height="16" rx="3" fill="' + c.glass + '"/>' + led(82, 47.5, '93°', 10) +
        '<circle cx="118" cy="44" r="5" fill="' + c.dark + '"/><circle cx="136" cy="44" r="5" fill="' + c.dark + '"/>' +
        '<rect x="64" y="76" width="72" height="90" rx="6" fill="' + c.glass + '"/>' +
        '<rect x="86" y="76" width="28" height="14" rx="3" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<path d="M96 92v34M104 92v34" stroke="#8A5530" stroke-width="2.5"/>' +
        '<path d="M84 128h32v14a10 10 0 0 1-10 10h-12a10 10 0 0 1-10-10Z" fill="#FFFFFF" stroke="#A9B3BD" stroke-width="1.5"/>' +
        '<path d="M116 132a6 6 0 0 1 0 12" fill="none" stroke="#A9B3BD" stroke-width="3"/>' +
        '<rect x="64" y="156" width="72" height="8" rx="2" fill="' + c.mid + '"/>' +
        '<path d="M152 92h8v50" stroke="' + c.edge + '" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    },
    iron: function (c) {
      return sh(100, 170, 76) +
        '<path d="M24 156q10-24 52-26h100v26Z" fill="#C9D0D6" stroke="#8A96A2" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M92 98q4-44 34-46h32q10 0 8 12l-6 34" fill="none" stroke="' + c.edge + '" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M92 98q4-44 34-46h32q10 0 8 12l-6 34" fill="none" stroke="' + c.body + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M34 132q18-34 64-36h70q8 0 8 8v28Z" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M52 128q12-20 40-22v22Z" fill="' + WATER + '" opacity=".5"/>' +
        '<circle cx="148" cy="114" r="8" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<path d="M148 108v6" stroke="' + c.dark + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="124" cy="114" r="3" fill="' + LED + '"/>' +
        '<path d="M16 132q-7-9 0-18t0-18M30 120q-7-9 0-18t0-18" stroke="' + WATER + '" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>';
    },
    ac: function (c) {
      return '<rect x="14" y="56" width="172" height="62" rx="16" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M26 102h148" stroke="' + c.mid + '" stroke-width="2"/>' +
        '<path d="M30 110h140q-8 16-70 18-62-2-70-18Z" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<rect x="136" y="68" width="34" height="15" rx="3" fill="' + c.glass + '"/>' + led(153, 79, '22°', 10) +
        '<circle cx="32" cy="72" r="2.5" fill="' + c.edge + '"/>' +
        '<path d="M64 140c-8 8 8 16 0 24s8 16 0 24M100 140c-8 8 8 16 0 24s8 16 0 24M136 140c-8 8 8 16 0 24s8 16 0 24" stroke="' + WATER + '" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>' +
        '<path d="M30 66h80" stroke="' + SHINE + '" stroke-width="4" stroke-linecap="round"/>';
    },
    blender: function (c) {
      return sh(100, 186, 42) +
        '<path d="M134 56h16q6 0 6 6v50q0 6-6 6h-20" fill="none" stroke="' + c.edge + '" stroke-width="7" stroke-linejoin="round"/>' +
        '<path d="M66 42h68l-8 96H74Z" fill="rgba(142,193,227,.25)" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M70.2 92q29.8-8 59.6 0L126 138H74Z" fill="#E59A3A" opacity=".8"/>' +
        '<path d="M86 130l28-4M88 124l24 8" stroke="' + c.dark + '" stroke-width="2"/>' +
        '<rect x="62" y="32" width="76" height="12" rx="4" fill="' + c.dark + '"/>' +
        '<path d="M62 140h76l-6 42H68Z" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<circle cx="100" cy="162" r="9" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="1.5"/>' +
        '<path d="M100 155v6" stroke="' + c.dark + '" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M76 52l5 34" stroke="' + SHINE + '" stroke-width="4" stroke-linecap="round"/>';
    },
    multicooker: function (c) {
      return sh(100, 182, 64) +
        '<rect x="38" y="86" width="124" height="94" rx="28" fill="' + c.body + '" stroke="' + c.edge + '" stroke-width="2"/>' +
        '<path d="M36 98q0-46 64-46t64 46Z" fill="' + c.mid + '" stroke="' + c.edge + '" stroke-width="2" stroke-linejoin="round"/>' +
        '<rect x="90" y="56" width="20" height="9" rx="4" fill="' + c.dark + '"/>' +
        '<rect x="126" y="76" width="18" height="8" rx="4" fill="' + c.dark + '"/>' +
        '<rect x="70" y="112" width="60" height="36" rx="8" fill="' + c.glass + '"/>' + led(100, 135, '1:20', 13) +
        '<circle cx="84" cy="162" r="3" fill="' + c.dark + '"/><circle cx="100" cy="162" r="3" fill="' + c.dark + '"/><circle cx="116" cy="162" r="3" fill="' + c.dark + '"/>' +
        '<path d="M95 46q-6-8 0-16t0-16M107 46q-6-8 0-16t0-16" stroke="' + WATER + '" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>' +
        '<path d="M52 82q10-20 34-24" stroke="' + SHINE + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    }
  };

  window.drawAppliance = function (kind, color) {
    var draw = DRAW[kind] || DRAW.fridge;
    var c = PAL[color] || PAL.white;
    return '<svg class="appliance" viewBox="0 0 200 200" aria-hidden="true" focusable="false">' + draw(c) + '</svg>';
  };
})();
