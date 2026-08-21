import { writeFileSync } from 'node:fs';
import { loadPalette } from './palette.ts';
import { PATHS } from './paths.ts';
import { readPromptBlock } from './promptBlock.ts';
import { emitPrompts } from './prompts.ts';
import type { PromptedAsset } from './prompts.ts';
import { auditPrompts } from './auditPrompts.ts';
import type { AuditPrompt } from './auditPrompts.ts';

/**
 * The prompt set as a single offline HTML page.
 *
 * Generation happens outside this environment — the agent has no image model —
 * so the handover artefact matters more than usual. Somebody is going to sit
 * with this open in one window and a generator in another, copying one prompt at
 * a time, roughly a hundred and seventy times. The page is built for that job
 * and nothing else: find, copy, tick off, move on.
 *
 * **The prompt strings are reproduced exactly.** They are HTML-escaped for
 * display and read back with `textContent`, which returns the original bytes, so
 * the copy button yields precisely what `emitPrompts()` produced. Nothing is
 * summarised, reflowed or truncated — a "helpfully" reformatted style block
 * would silently break the one contract holding 165 sprites together.
 *
 * Self-contained by requirement: inline CSS, inline JS, no fonts, no CDN. It has
 * to work from `file://` on a machine with no network, which is also why copying
 * falls back to `document.execCommand` — `navigator.clipboard` is unavailable in
 * a non-secure context, and a copy button that silently does nothing would be
 * worse than no button.
 */

export interface ExportedPrompt extends PromptedAsset {
  /** Present on the 2026-08-21 audit's cards — status/priority metadata. */
  readonly audit?: AuditPrompt['audit'];
  /** Set on a delivered card whose target a corrected audit prompt now owns. */
  readonly supersededBy?: string;
  /** Stable, zero-padded, assigned in emission order. */
  readonly id: string;
  readonly index: number;
}

export function numberPrompts(assets: readonly PromptedAsset[]): ExportedPrompt[] {
  return assets.map((asset, index) => ({
    ...asset,
    index: index + 1,
    id: `P${String(index + 1).padStart(3, '0')}`,
  }));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `veh` from `veh_sedan_default_se@2x.png`. */
function categoryOf(asset: PromptedAsset): string {
  return asset.subjectKey.split('/')[0] ?? 'unknown';
}

const STYLE = `
:root{--bg:#12141a;--panel:#1b1e27;--edge:#2b303d;--ink:#e8e9ee;--dim:#9aa0b8;
--accent:#5bb169;--warn:#d98a16;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:20px 24px 14px;border-bottom:1px solid var(--edge)}
h1{margin:0 0 6px;font-size:19px;letter-spacing:.2px}
.sub{color:var(--dim);font-size:13px}
.sub code{font-family:var(--mono);font-size:12px}
.stats{display:flex;gap:22px;margin-top:12px;flex-wrap:wrap}
.stat b{display:block;font-size:20px;line-height:1.2}
.stat span{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.6px}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--edge);
padding:11px 24px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
input[type=search]{flex:1;min-width:220px;background:var(--panel);border:1px solid var(--edge);
color:var(--ink);border-radius:6px;padding:7px 10px;font-size:13px}
input[type=search]:focus{outline:2px solid var(--accent);outline-offset:-1px}
button{background:var(--panel);border:1px solid var(--edge);color:var(--ink);border-radius:6px;
padding:6px 11px;font-size:12px;cursor:pointer;font-family:inherit}
button:hover{border-color:var(--dim)}
button.on{background:var(--accent);border-color:var(--accent);color:#0d1410;font-weight:600}
.filters{display:flex;gap:6px;flex-wrap:wrap}
main{padding:0 24px 60px}
.batch{margin:26px 0 0}
.batch>h2{font-size:15px;margin:0 0 4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.batch>h2 .n{color:var(--dim);font-weight:400;font-size:12px}
.note{color:var(--dim);font-size:12px;margin:0 0 12px;max-width:78ch}
.card{background:var(--panel);border:1px solid var(--edge);border-radius:8px;margin:0 0 14px;overflow:hidden}
.card>.head{display:flex;gap:12px;align-items:baseline;padding:10px 13px;border-bottom:1px solid var(--edge);flex-wrap:wrap}
.pid{font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:700}
.file{font-family:var(--mono);font-size:12px;word-break:break-all}
.tag{font-size:11px;color:var(--dim);border:1px solid var(--edge);border-radius:4px;padding:1px 6px}
.tag.split{color:var(--warn);border-color:var(--warn)}
.tag.new{background:#3f5d2e;color:#d7f0c0;border-radius:4px;padding:0 6px}
.tag.superseded{background:#5d3a2e;color:#f0d0c0;border-radius:4px;padding:0 6px}
.meta{padding:9px 13px;font-size:12.5px;color:var(--dim);border-bottom:1px solid var(--edge)}
.meta b{color:var(--ink);font-weight:600}
.meta div+div{margin-top:4px}
pre{margin:0;padding:13px;font-family:var(--mono);font-size:11.5px;line-height:1.55;
white-space:pre-wrap;word-break:break-word;max-height:340px;overflow:auto;background:#161922}
.acts{padding:9px 13px;display:flex;gap:8px;border-top:1px solid var(--edge)}
.empty{padding:40px 0;color:var(--dim);text-align:center}
.hide{display:none!important}
footer{padding:20px 24px;border-top:1px solid var(--edge);color:var(--dim);font-size:12px}
`;

/**
 * Inline, dependency-free, and deliberately small.
 *
 * Reads prompt text from the DOM rather than from an embedded JSON copy, so the
 * text that gets copied is provably the text that is displayed — there is no
 * second source that could drift.
 */
const SCRIPT = `
(function(){
  var q=document.getElementById('q'), cards=[].slice.call(document.querySelectorAll('.card'));
  var batches=[].slice.call(document.querySelectorAll('.batch'));
  var counter=document.getElementById('shown'), active='all';

  function copy(text,btn){
    var done=function(){var t=btn.textContent;btn.textContent='Copied';setTimeout(function(){btn.textContent=t},1100)};
    // navigator.clipboard needs a secure context and this page is opened from
    // disk, so the deprecated path is the one that usually runs. Both are kept:
    // a copy button that silently fails is worse than no copy button.
    if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(done,function(){fallback(text,done)})}
    else fallback(text,done);
  }
  function fallback(text,done){
    var ta=document.createElement('textarea');
    ta.value=text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta); ta.select();
    try{document.execCommand('copy'); done()}catch(e){alert('Copy failed — select the text manually.')}
    document.body.removeChild(ta);
  }

  function apply(){
    var term=q.value.trim().toLowerCase(), shown=0;
    cards.forEach(function(c){
      var okCat = active==='all' || c.getAttribute('data-cat')===active;
      var okTerm = !term || c.getAttribute('data-search').indexOf(term)>=0;
      var show = okCat && okTerm;
      c.classList.toggle('hide',!show);
      if(show) shown++;
    });
    batches.forEach(function(b){
      var any=[].slice.call(b.querySelectorAll('.card')).some(function(c){return !c.classList.contains('hide')});
      b.classList.toggle('hide',!any);
    });
    counter.textContent=shown;
    document.getElementById('none').classList.toggle('hide',shown>0);
  }

  q.addEventListener('input',apply);
  [].slice.call(document.querySelectorAll('.filters button')).forEach(function(b){
    b.addEventListener('click',function(){
      active=b.getAttribute('data-cat');
      [].slice.call(document.querySelectorAll('.filters button')).forEach(function(o){o.classList.toggle('on',o===b)});
      apply();
    });
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('button[data-copy]'); if(!b) return;
    if(b.getAttribute('data-copy')==='one'){
      copy(b.closest('.card').querySelector('pre').textContent,b);
    } else {
      var texts=[].slice.call(b.closest('.batch').querySelectorAll('.card')).filter(function(c){
        return !c.classList.contains('hide');
      }).map(function(c){
        return '### '+c.getAttribute('data-file')+'\\n'+c.querySelector('pre').textContent;
      });
      copy(texts.join('\\n\\n'+'='.repeat(70)+'\\n\\n'),b);
    }
  });
  apply();
})();
`;

export interface ExportResult {
  readonly path: string;
  readonly count: number;
  readonly batches: number;
  readonly categories: readonly string[];
}

export function renderPromptHtml(assets: readonly ExportedPrompt[]): string {
  const block = readPromptBlock();
  const palette = loadPalette();
  const batches = [...new Set(assets.map((asset) => asset.batch))];
  const categories = [...new Set(assets.map(categoryOf))].sort();

  const cards = (batch: string): string =>
    assets
      .filter((asset) => asset.batch === batch)
      .map((asset) => {
        const category = categoryOf(asset);
        const search =
          `${asset.id} ${asset.file} ${category} ${asset.subjectKey} ${asset.describe}`.toLowerCase();
        const size =
          asset.size === null ? 'derived per part' : `${asset.size.width} x ${asset.size.height} px`;
        const superseded =
          asset.supersededBy === undefined ? '' : ` data-superseded-by="${escapeHtml(asset.supersededBy)}"`;
        const auditTag =
          asset.audit === undefined ? '' : `\n          <span class="tag new">new in this audit</span>`;
        const supersededTag =
          asset.supersededBy === undefined
            ? ''
            : `\n          <span class="tag superseded">superseded by ${escapeHtml(asset.supersededBy)}</span>`;
        const auditMeta =
          asset.audit === undefined
            ? ''
            : `\n          <div><b>Status:</b> ${escapeHtml(asset.audit.status)}</div>` +
              `\n          <div><b>Runtime role:</b> ${escapeHtml(asset.audit.role)}</div>` +
              `\n          <div><b>Priority:</b> ${escapeHtml(asset.audit.priority)} · <b>Stage:</b> ${escapeHtml(asset.audit.stage)}${asset.audit.before === null ? '' : ` · <b>Needed before:</b> ${escapeHtml(asset.audit.before)}`}</div>`;
        return `      <article class="card" data-cat="${escapeHtml(category)}" data-file="${escapeHtml(asset.file)}" data-search="${escapeHtml(search)}"${superseded}>
        <div class="head">
          <span class="pid">${asset.id}</span>
          <span class="file">${escapeHtml(asset.file)}</span>
          <span class="tag">${escapeHtml(category)}</span>
          <span class="tag">${escapeHtml(asset.subjectKey)}</span>
          ${asset.split ? '<span class="tag split">split half</span>' : ''}${auditTag}${supersededTag}
        </div>
        <div class="meta">
          <div><b>Subject:</b> ${escapeHtml(asset.describe)}</div>
          <div><b>Size:</b> ${escapeHtml(size)}</div>
          <div><b>Target file:</b> <span class="file">${escapeHtml(asset.file)}</span></div>${auditMeta}
        </div>
        <pre>${escapeHtml(asset.prompt)}</pre>
        <div class="acts"><button data-copy="one">Copy prompt</button></div>
      </article>`;
      })
      .join('\n');

  const sections = batches
    .map((batch) => {
      const count = assets.filter((asset) => asset.batch === batch).length;
      const note = batch.startsWith('audit-')
        ? 'Appended by the 2026-08-21 exhaustive audit (docs/FINAL_ASSET_REQUIREMENTS.md). Same rules as every batch: one session per batch, golden references attached, immutable block untouched.'
        : batch === 'golden-references'
          ? 'Generate these FIRST and settle them before anything else — they become the style for every asset that follows, and each one is attached as a reference image afterwards. They cite no reference of their own.'
          : 'Generate this batch in ONE session with the approved golden references attached (ASSET_PIPELINE §4.3 step 3). Same-session coherence is most of what keeps a category looking related; never generate these one at a time.';
      return `    <section class="batch" id="batch-${escapeHtml(batch)}">
      <h2>${escapeHtml(batch)} <span class="n">${count} prompts</span>
        <button data-copy="batch">Copy all in batch</button></h2>
      <p class="note">${note}</p>
${cards(batch)}
    </section>`;
    })
    .join('\n');

  const filters = ['all', ...categories]
    .map(
      (category) =>
        `<button data-cat="${escapeHtml(category)}"${category === 'all' ? ' class="on"' : ''}>${escapeHtml(category)}</button>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evolutionary Tycoon — Asset Generation Prompts</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Asset Generation Prompts — Evolutionary Tycoon</h1>
  <p class="sub">
    Generated by <code>pnpm assets:prompts:html</code> from <code>docs/assets/productionBatches.json</code>.
    Prompt block <code>${block.hash.slice(0, 12)}</code> · palette v${palette.spec.version} (${palette.spec.size} colours) ·
    tool: God Mode AI (licence gate opened by executive override, <code>assets/LICENSES.md</code> §1.5).
  </p>
  <p class="sub">
    Prompts are reproduced <b>exactly</b> as emitted. Do not reword, shorten or reflow them — the immutable
    style block is the only thing keeping ${assets.length} separately generated images looking like one world.
  </p>
  <div class="stats">
    <div class="stat"><b>${assets.length}</b><span>prompts</span></div>
    <div class="stat"><b>${batches.length}</b><span>batches</span></div>
    <div class="stat"><b>${categories.length}</b><span>categories</span></div>
    <div class="stat"><b><span id="shown">${assets.length}</span></b><span>shown</span></div>
  </div>
</header>

<div class="bar">
  <input id="q" type="search" placeholder="Search prompt id, filename, subject or description…" autocomplete="off">
  <div class="filters">${filters}</div>
</div>

<main>
${sections}
  <p class="empty hide" id="none">Nothing matches that filter.</p>
</main>

<footer>
  Workflow: generate the golden references first and settle them · then one batch per session with the
  goldens attached · drop results in <code>assets/source/</code> with their anchor sidecars ·
  <code>pnpm assets:validate</code> · regenerate what fails, never lower a threshold ·
  <code>pnpm assets:build</code> · <code>pnpm assets:contact-sheet</code> for the consistency review.
</footer>

<script>${SCRIPT}</script>
</body>
</html>
`;
}

/**
 * Everything the catalog renders: the 172 delivered prompts, then the audit's
 * corrected/new prompts in matrix order, with superseded targets marked on
 * the delivered card so exactly one canonical prompt owns every file.
 */
export function allPrompts(): ExportedPrompt[] {
  const audit = auditPrompts();
  const supersededTargets = new Map(audit.map((entry) => [entry.file, entry]));
  const delivered = emitPrompts();
  const numbered = numberPrompts([...delivered, ...audit]);
  return numbered.map((asset, index) => {
    const auditEntry = index >= delivered.length ? audit[index - delivered.length] : undefined;
    if (auditEntry !== undefined) return { ...asset, audit: auditEntry.audit };
    const successor = supersededTargets.get(asset.file);
    if (successor === undefined) return asset;
    const successorIndex = delivered.length + audit.indexOf(successor);
    return { ...asset, supersededBy: `P${String(successorIndex + 1).padStart(3, '0')}` };
  });
}

export function exportPromptHtml(path: string = PATHS.promptHtml): ExportResult {
  const assets = allPrompts();
  writeFileSync(path, renderPromptHtml(assets), 'utf8');
  return {
    path,
    count: assets.length,
    batches: new Set(assets.map((asset) => asset.batch)).size,
    categories: [...new Set(assets.map(categoryOf))].sort(),
  };
}
