/*
 * ТекстСкан — сохранение результата в файлы разных форматов.
 * Документ передаётся как список строк: [{ runs: [{ text, kind?, orig?, conf? }] }],
 * пустая строка — разрыв абзаца. Всё формируется локально, без сети.
 */
(function () {
  'use strict';

  const KIND_LABEL = {
    fixed: 'Исправлено',
    guess: 'Предположение',
    unclear: 'Не удалось разобрать',
    user: 'Выбрано вручную',
    reverted: 'Оставлен исходный вариант',
  };
  const KIND_COLOR = { fixed: 'DCFCE7', guess: 'FEF3C7', unclear: 'FEE2E2', user: 'DBEAFE', reverted: 'F1F5F9' };

  // ---------- ZIP (без сжатия) для DOCX и ODT ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // имена в UTF-8
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cenSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
  }

  // ---------- Помощники ----------
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // недопустимые в XML управляющие символы
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const html = xml;
  const lineText = (line) => line.runs.map((r) => r.text).join('');
  function plain(doc, nl) { return doc.lines.map(lineText).join(nl || '\n'); }
  function paragraphs(doc) {
    // группируем строки в абзацы по пустым строкам
    const out = [];
    let cur = [];
    for (const l of doc.lines) {
      if (!lineText(l).trim()) { if (cur.length) out.push(cur); cur = []; } else cur.push(l);
    }
    if (cur.length) out.push(cur);
    return out;
  }
  function note(run) {
    const parts = [KIND_LABEL[run.kind] || 'Изменено'];
    if (run.orig && run.orig !== run.text) parts.push(`распознано как «${run.orig}»`);
    if (run.conf !== undefined && run.conf !== null) parts.push(`уверенность ${run.conf}%`);
    return parts.join(', ');
  }

  // ---------- Форматы ----------
  function toTxt(doc) {
    return new Blob(['\uFEFF' + plain(doc, '\r\n')], { type: 'text/plain;charset=utf-8' });
  }

  function toMd(doc) {
    const esc = (s) => s.replace(/([\\`*_[\]#|<>])/g, '\\$1').replace(/^(\s*)([-+]|\d+\.)(\s)/, '$1\\$2$3');
    const body = paragraphs(doc).map((p) => p.map((l) => esc(lineText(l))).join('  \n')).join('\n\n');
    return new Blob([`# ${doc.title}\n\n${body}\n`], { type: 'text/markdown;charset=utf-8' });
  }

  function toHtml(doc, mark) {
    const css = `body{font:16px/1.6 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;max-width:780px;margin:40px auto;padding:0 20px;color:#1f2937}
h1{font-size:22px} p{margin:0 0 1em;white-space:pre-wrap}
mark{border-radius:3px;padding:0 2px;cursor:help} .fixed{background:#dcfce7} .guess{background:#fef3c7} .unclear{background:#fee2e2} .user{background:#dbeafe} .reverted{background:#f1f5f9}
.legend{font-size:13px;color:#555;margin-bottom:24px} .legend mark{margin-right:10px}`;
    const legend = mark && doc.lines.some((l) => l.runs.some((r) => r.kind))
      ? `<div class="legend"><mark class="fixed">исправлено</mark><mark class="guess">предположение</mark><mark class="unclear">не разобрано</mark> — наведите на слово, чтобы увидеть исходный вариант</div>`
      : '';
    const body = paragraphs(doc).map((p) => '<p>' + p.map((l) => l.runs.map((r) => (
      mark && r.kind ? `<mark class="${r.kind}" title="${html(note(r))}">${html(r.text)}</mark>` : html(r.text)
    )).join('')).join('<br>\n') + '</p>').join('\n');
    const out = `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(doc.title)}</title><style>${css}</style></head><body>\n<h1>${html(doc.title)}</h1>\n${legend}\n${body}\n</body></html>\n`;
    return new Blob([out], { type: 'text/html;charset=utf-8' });
  }

  function toJson(doc) {
    const corrections = [];
    for (const l of doc.lines) for (const r of l.runs) if (r.kind) corrections.push({ text: r.text, original: r.orig, kind: r.kind, label: KIND_LABEL[r.kind], confidence: r.conf, alternatives: r.alts || [] });
    const data = {
      app: 'ТекстСкан',
      created: new Date().toISOString(),
      title: doc.title,
      text: plain(doc),
      corrections,
      pages: doc.pages || [],
    };
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  }

  function toRtf(doc, mark) {
    const enc = (s) => {
      let out = '';
      for (const ch of s) {
        const c = ch.codePointAt(0);
        if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
        else if (ch === '\t') out += '\\tab ';
        else if (c < 128) out += ch;
        else if (c <= 0xffff) out += `\\u${c > 32767 ? c - 65536 : c}?`;
        else {
          const hi = Math.floor((c - 0x10000) / 0x400) + 0xd800, lo = ((c - 0x10000) % 0x400) + 0xdc00;
          out += `\\u${hi - 65536}?\\u${lo - 65536}?`;
        }
      }
      return out;
    };
    const colors = { fixed: 1, guess: 2, unclear: 3, user: 4, reverted: 5 };
    const ctbl = '{\\colortbl ;\\red220\\green252\\blue231;\\red254\\green243\\blue199;\\red254\\green226\\blue226;\\red219\\green234\\blue254;\\red241\\green245\\blue249;}';
    const paras = paragraphs(doc).map((p) => '\\pard\\sa200\\sl276\\slmult1 ' + p.map((l) => l.runs.map((r) => (
      mark && r.kind ? `{\\chcbpat${colors[r.kind]}\\highlight${colors[r.kind]} ${enc(r.text)}}` : enc(r.text)
    )).join('')).join('\\line ') + '\\par');
    const rtf = `{\\rtf1\\ansi\\ansicpg1251\\deff0\\uc1{\\fonttbl{\\f0\\fswiss\\fcharset204 Calibri;}}${ctbl}\\f0\\fs24\n${paras.join('\n')}\n}`;
    return new Blob([rtf], { type: 'application/rtf' });
  }

  function toDocx(doc, mark) {
    let cid = 0;
    const comments = [];
    const runXml = (text, shade) => {
      const rpr = shade ? `<w:rPr><w:shd w:val="clear" w:color="auto" w:fill="${shade}"/></w:rPr>` : '';
      return `<w:r>${rpr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
    };
    const body = paragraphs(doc).map((p) => {
      const inner = p.map((l, li) => {
        const runs = l.runs.map((r) => {
          if (!(mark && r.kind)) return runXml(r.text);
          const id = cid++;
          comments.push(`<w:comment w:id="${id}" w:author="ТекстСкан" w:initials="ТС" w:date="${new Date().toISOString().slice(0, 19)}Z"><w:p><w:r><w:t xml:space="preserve">${xml(note(r))}</w:t></w:r></w:p></w:comment>`);
          return `<w:commentRangeStart w:id="${id}"/>${runXml(r.text, KIND_COLOR[r.kind])}<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`;
        }).join('');
        return (li ? '<w:r><w:br/></w:r>' : '') + runs;
      }).join('');
      return `<w:p>${inner}</w:p>`;
    }).join('');
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body || '<w:p/>'}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const hasComments = comments.length > 0;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hasComments ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(doc.title)}</dc:title><dc:creator>ТекстСкан</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
      { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${hasComments ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>' : ''}</Relationships>` },
      { name: 'word/document.xml', data: document },
      { name: 'word/styles.xml', data: styles },
    ];
    if (hasComments) files.push({ name: 'word/comments.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments ${W}>${comments.join('')}</w:comments>` });
    const blob = zip(files);
    return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function toOdt(doc, mark) {
    const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"';
    const esc = (s) => xml(s).replace(/\t/g, '<text:tab/>').replace(/ {2,}/g, (m) => ' ' + `<text:s text:c="${m.length - 1}"/>`);
    const body = paragraphs(doc).map((p) => '<text:p text:style-name="P1">' + p.map((l) => l.runs.map((r) => {
      if (!(mark && r.kind)) return esc(r.text);
      return `<office:annotation><dc:creator>ТекстСкан</dc:creator><text:p>${xml(note(r))}</text:p></office:annotation><text:span text:style-name="K_${r.kind}">${esc(r.text)}</text:span>`;
    }).join('')).join('<text:line-break/>') + '</text:p>').join('');
    const kindStyles = Object.keys(KIND_COLOR).map((k) => `<style:style style:name="K_${k}" style:family="text"><style:text-properties fo:background-color="#${KIND_COLOR[k]}"/></style:style>`).join('');
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.2"><office:automatic-styles><style:style style:name="P1" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.25cm" fo:line-height="115%"/><style:text-properties style:font-name="Calibri" fo:font-size="12pt" fo:language="ru" fo:country="RU"/></style:style>${kindStyles}</office:automatic-styles><office:body><office:text>${body || '<text:p/>'}</office:text></office:body></office:document-content>`;
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.2"><office:font-face-decls><style:font-face style:name="Calibri" svg:font-family="Calibri" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"/></office:font-face-decls><office:styles><style:default-style style:family="paragraph"><style:text-properties style:font-name="Calibri" fo:font-size="12pt"/></style:default-style></office:styles></office:document-styles>`;
    const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS} office:version="1.2"><office:meta><dc:title>${xml(doc.title)}</dc:title><meta:generator>ТекстСкан</meta:generator></office:meta></office:document-meta>`;
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
    const blob = zip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text' },
      { name: 'content.xml', data: content },
      { name: 'styles.xml', data: styles },
      { name: 'meta.xml', data: meta },
      { name: 'META-INF/manifest.xml', data: manifest },
    ]);
    return new Blob([blob], { type: 'application/vnd.oasis.opendocument.text' });
  }

  async function toPdf(doc, mark) {
    const { jsPDF, font } = await window.TSOcr.loadPdfTools();
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    pdf.addFileToVFS('DejaVuSans.ttf', font);
    pdf.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
    pdf.setFont('DejaVu', 'normal');
    pdf.setProperties({ title: doc.title, creator: 'ТекстСкан' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const M = 56, size = 11.5, lh = size * 1.5;
    const maxW = pageW - M * 2;
    let y = M;
    const rgb = (hex) => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    const newPageIfNeeded = () => { if (y + lh > pageH - M) { pdf.addPage(); y = M; } };

    pdf.setFontSize(16);
    pdf.setTextColor(17, 24, 39);
    for (const l of pdf.splitTextToSize(doc.title, maxW)) { pdf.text(l, M, y + 12); y += 22; }
    y += 8;
    pdf.setFontSize(size);
    const space = pdf.getTextWidth(' ');

    for (const para of paragraphs(doc)) {
      for (const line of para) {
        // разбиваем строку на «слова», сохраняя пометки
        const words = [];
        for (const r of line.runs) {
          const pieces = r.text.split(/(\s+)/);
          for (const p of pieces) {
            if (!p) continue;
            if (/^\s+$/.test(p)) { words.push({ space: true }); continue; }
            const last = words[words.length - 1];
            if (last && !last.space) last.parts.push({ text: p, kind: r.kind });
            else words.push({ parts: [{ text: p, kind: r.kind }] });
          }
        }
        let x = M;
        newPageIfNeeded();
        let pendingSpace = false;
        for (const w of words) {
          if (w.space) { pendingSpace = x > M; continue; }
          let width = w.parts.reduce((s, p) => s + pdf.getTextWidth(p.text), 0);
          if (pendingSpace && x + space + width > M + maxW) { y += lh; x = M; newPageIfNeeded(); pendingSpace = false; }
          if (pendingSpace) x += space;
          // очень длинное слово — режем по символам
          for (const p of w.parts) {
            let text = p.text;
            while (text) {
              let fit = text;
              while (pdf.getTextWidth(fit) > M + maxW - x && fit.length > 1) fit = fit.slice(0, -1);
              if (pdf.getTextWidth(fit) > M + maxW - x && x > M) { y += lh; x = M; newPageIfNeeded(); continue; }
              const tw = pdf.getTextWidth(fit);
              if (mark && p.kind && KIND_COLOR[p.kind]) {
                pdf.setFillColor(...rgb(KIND_COLOR[p.kind]));
                pdf.rect(x - 1, y - 1, tw + 2, size + 5, 'F');
              }
              pdf.setTextColor(31, 41, 55);
              pdf.text(fit, x, y + size);
              x += tw;
              text = text.slice(fit.length);
              if (text) { y += lh; x = M; newPageIfNeeded(); }
            }
          }
          pendingSpace = false;
        }
        y += lh;
      }
      y += lh * 0.5;
    }
    return pdf.output('blob');
  }

  const FORMATS = {
    docx: { label: 'DOCX', desc: 'Word', ext: 'docx', make: toDocx, marks: true },
    pdf: { label: 'PDF', desc: 'Документ PDF', ext: 'pdf', make: toPdf, marks: true },
    txt: { label: 'TXT', desc: 'Простой текст', ext: 'txt', make: toTxt },
    rtf: { label: 'RTF', desc: 'WordPad, Word', ext: 'rtf', make: toRtf, marks: true },
    odt: { label: 'ODT', desc: 'LibreOffice', ext: 'odt', make: toOdt, marks: true },
    html: { label: 'HTML', desc: 'Веб-страница', ext: 'html', make: toHtml, marks: true },
    md: { label: 'MD', desc: 'Markdown', ext: 'md', make: toMd },
    json: { label: 'JSON', desc: 'Данные и правки', ext: 'json', make: toJson },
  };

  async function make(format, doc, mark) {
    const f = FORMATS[format];
    if (!f) throw new Error('Неизвестный формат ' + format);
    return f.make(doc, mark);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  window.TSExport = { FORMATS, make, download, plain, zip, crc32 };
})();
