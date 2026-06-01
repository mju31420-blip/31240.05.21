import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';

function readArg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const DEFAULT_OUT_DIR = process.platform === 'win32'
  ? 'C:\\Users\\Public\\Documents\\ESTsoft\\CreatorTemp\\myeong-biseo-ocr-readiness'
  : path.join(os.tmpdir(), 'myeong-biseo-ocr-readiness');
const OUT_DIR = readArg('--out', process.env.MB_OCR_READINESS_DIR || DEFAULT_OUT_DIR);
const WRITE_REPORT = !process.argv.includes('--no-report');
const ALLOW_EXTERNAL_OCR = process.env.MB_ALLOW_EXTERNAL_OCR === '1' || process.argv.includes('--allow-external');
const REQUIRE_FULL_OCR = process.argv.includes('--require-full') || process.argv.includes('--production');
const OCR_RUNS = readArg('--ocr-runs', '2');
const OCR_RUN_COUNT = Number(OCR_RUNS);
const OCR_FILTER = readArg('--ocr-filter', '');
const OCR_PREPROCESS = readArg('--ocr-preprocess', 'none');
const UTF8_DECODER = new TextDecoder('utf-8');
const WIN949_DECODER = new TextDecoder('windows-949');
const SELF_TEST = process.argv.includes('--self-test');
const CHILD_MAX_BUFFER = 20 * 1024 * 1024;

function nowKstIso() {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${fmt.format(new Date()).replace(' ', 'T')}+09:00`;
}

function run(label, cmd, args, options = {}) {
  const bin = process.platform === 'win32' && cmd === 'npm' ? 'cmd.exe' : cmd;
  const finalArgs = process.platform === 'win32' && cmd === 'npm' ? ['/c', 'npm', ...args] : args;
  const started = Date.now();
  const result = spawnSync(bin, finalArgs, {
    windowsHide: true,
    maxBuffer: CHILD_MAX_BUFFER,
    ...options,
  });
  const ms = Date.now() - started;
  return {
    label,
    cmd: [bin, ...finalArgs].join(' '),
    ok: result.status === 0,
    status: result.status,
    ms,
    stdout: decodeOutput(result.stdout),
    stderr: decodeOutput(result.stderr) || result.error?.message || '',
  };
}

function decodeOutput(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const utf8 = UTF8_DECODER.decode(value);
  if (process.platform !== 'win32') return utf8;
  const win949 = WIN949_DECODER.decode(value);
  return textNoiseScore(win949) < textNoiseScore(utf8) ? win949 : utf8;
}

function textNoiseScore(text) {
  const s = String(text || '');
  const replacement = (s.match(/\uFFFD/g) || []).length;
  const cjk = (s.match(/[\u4E00-\u9FFF]/g) || []).length;
  const suspicious = (s.match(/[\u6028\u6FD1\uC12C\uC3D2\uAC13\uF98F\u8ADB]/g) || []).length;
  const hangul = (s.match(/[\uAC00-\uD7A3]/g) || []).length;
  return replacement * 30 + cjk * 2 + suspicious * 3 - hangul;
}

function printResult(result) {
  const mark = result.ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${result.label} (${result.ms}ms)`);
  if (!result.ok) {
    const detail = `${result.stdout}\n${result.stderr}`.trim();
    if (detail) console.log(detail);
  }
}

function trimLog(text, limit = 6000) {
  const s = String(text || '').trim();
  if (s.length <= limit) return s;
  return `${s.slice(0, limit)}\n... <trimmed ${s.length - limit} chars>`;
}

function parsePreflight(stdout) {
  try {
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseOcrEvalArtifacts(stdout) {
  const text = String(stdout || '');
  const pick = (label) => {
    const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  };
  const parseVerdict = () => {
    const marker = '===== VERDICT =====';
    const markerIdx = text.indexOf(marker);
    if (markerIdx < 0) return null;
    const after = text.slice(markerIdx + marker.length);
    const start = after.indexOf('{');
    if (start < 0) return null;
    const labelIdx = after.search(/\n(?:JSON|MD|LATEST_JSON|LATEST_MD):/);
    const raw = (labelIdx >= 0 ? after.slice(start, labelIdx) : after.slice(start)).trim();
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const verdict = parseVerdict();
  const artifacts = {
    json: pick('JSON'),
    md: pick('MD'),
    latestJson: pick('LATEST_JSON'),
    latestMd: pick('LATEST_MD'),
    verdictStatus: verdict?.status || null,
    blockers: Array.isArray(verdict?.blockers) ? verdict.blockers : [],
    warnings: Array.isArray(verdict?.warnings) ? verdict.warnings : [],
  };
  return Object.values(artifacts).some(Boolean) ? artifacts : null;
}

function strictOcrConfigIssues(config = {}) {
  const requireFull = config.requireFull ?? REQUIRE_FULL_OCR;
  const filter = config.filter ?? OCR_FILTER;
  const runs = config.runs ?? OCR_RUN_COUNT;
  if (!requireFull) return [];
  const issues = [];
  if (filter) {
    issues.push('Strict production OCR must evaluate all configured timetable images; remove --ocr-filter.');
  }
  if (!Number.isInteger(runs) || runs < 2) {
    issues.push('Strict production OCR requires at least 2 runs per image; use --ocr-runs 2 or higher.');
  }
  return issues;
}

function unusedOcrOptionIssues(config = {}) {
  const allowExternal = config.allowExternal ?? ALLOW_EXTERNAL_OCR;
  const filter = config.filter ?? OCR_FILTER;
  const runs = config.runsText ?? OCR_RUNS;
  const preprocess = config.preprocess ?? OCR_PREPROCESS;
  if (allowExternal) return [];
  const issues = [];
  if (filter) issues.push('--ocr-filter is only meaningful with --allow-external.');
  if (runs !== '2') issues.push('--ocr-runs is only meaningful with --allow-external.');
  if (preprocess !== 'none') issues.push('--ocr-preprocess is only meaningful with --allow-external.');
  return issues;
}

function baseReadinessVerdict({ hasHardFailures, allowExternal, fullConfigIssueCount }) {
  if (hasHardFailures) return 'FAIL';
  if (allowExternal) {
    return fullConfigIssueCount ? 'EXTERNAL_OCR_PARTIAL_PASS' : 'FULL_OCR_GATE_PASS';
  }
  return 'LOCAL_BETA_GATE_PASS';
}

function classifyExternalOcrEval({
  allowExternal,
  blockedByStrictConfig = false,
  actualExternalOcrOk = false,
  fullConfigIssueCount = 0,
  artifacts = null,
} = {}) {
  if (!allowExternal) return 'HELD_FOR_EXPLICIT_USER_APPROVAL';
  if (blockedByStrictConfig) return 'SKIPPED_INVALID_STRICT_CONFIG';
  if (actualExternalOcrOk) {
    return fullConfigIssueCount ? 'RUN_AND_PASS_PARTIAL_CONFIG' : 'RUN_AND_PASS';
  }
  if (artifacts?.verdictStatus === 'manual_review_required') return 'RUN_AND_NEEDS_MANUAL_REVIEW';
  if (artifacts?.verdictStatus === 'needs_fix') return 'RUN_AND_NEEDS_FIX';
  return 'RUN_AND_FAILED';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTest() {
  assert(strictOcrConfigIssues({ requireFull: false, filter: 'park', runs: 1 }).length === 0, 'non-strict config should not block exploratory evals');
  assert(strictOcrConfigIssues({ requireFull: true, filter: '', runs: 2 }).length === 0, 'strict full config should allow all images with 2 runs');
  assert(
    strictOcrConfigIssues({ requireFull: true, filter: 'park', runs: 2 }).some((msg) => msg.includes('--ocr-filter')),
    'strict full config should block filtered evals',
  );
  assert(
    strictOcrConfigIssues({ requireFull: true, filter: '', runs: 1 }).some((msg) => msg.includes('--ocr-runs')),
    'strict full config should block one-run evals',
  );
  assert(
    strictOcrConfigIssues({ requireFull: true, filter: '', runs: Number.NaN }).some((msg) => msg.includes('--ocr-runs')),
    'strict full config should block invalid run counts',
  );
  assert(
    baseReadinessVerdict({ hasHardFailures: false, allowExternal: true, fullConfigIssueCount: 1 }) === 'EXTERNAL_OCR_PARTIAL_PASS',
    'filtered or weak external OCR eval must not be labeled FULL_OCR_GATE_PASS',
  );
  assert(
    baseReadinessVerdict({ hasHardFailures: false, allowExternal: true, fullConfigIssueCount: 0 }) === 'FULL_OCR_GATE_PASS',
    'full external OCR eval should be labeled FULL_OCR_GATE_PASS',
  );
  assert(unusedOcrOptionIssues().length === 0, 'default readiness should not have unused OCR eval options');
  assert(
    unusedOcrOptionIssues({ allowExternal: false, filter: 'park', runsText: '2', preprocess: 'none' }).some((msg) => msg.includes('--ocr-filter')),
    'unused filter option should be blocked without --allow-external',
  );
  assert(
    unusedOcrOptionIssues({ allowExternal: false, filter: '', runsText: '3', preprocess: 'none' }).some((msg) => msg.includes('--ocr-runs')),
    'unused runs option should be blocked without --allow-external',
  );
  assert(
    unusedOcrOptionIssues({ allowExternal: false, filter: '', runsText: '2', preprocess: 'phone-crop' }).some((msg) => msg.includes('--ocr-preprocess')),
    'unused preprocess option should be blocked without --allow-external',
  );
  assert(
    unusedOcrOptionIssues({ allowExternal: true, filter: 'park', runsText: '1', preprocess: 'phone-crop' }).length === 0,
    'OCR eval options should be allowed when external OCR eval is explicitly enabled',
  );
  const parsedManualReview = parseOcrEvalArtifacts([
    '===== VERDICT =====',
    '{"status":"manual_review_required","blockers":[],"warnings":["missing-heavy"]}',
    'JSON: C:\\tmp\\ocr.json',
    'MD:   C:\\tmp\\ocr.md',
  ].join('\n'));
  assert(parsedManualReview?.verdictStatus === 'manual_review_required', 'OCR eval verdict status should be parsed');
  assert(parsedManualReview?.warnings?.includes('missing-heavy'), 'OCR eval verdict warnings should be parsed');
  const parsedNeedsFix = parseOcrEvalArtifacts([
    '===== VERDICT =====',
    '{"status":"needs_fix","blockers":["zero-class"],"warnings":[]}',
    'LATEST_JSON: C:\\tmp\\latest.json',
  ].join('\n'));
  assert(parsedNeedsFix?.verdictStatus === 'needs_fix', 'OCR eval needs_fix status should be parsed');
  assert(parsedNeedsFix?.blockers?.includes('zero-class'), 'OCR eval blockers should be parsed');
  const parsedPrettyVerdict = parseOcrEvalArtifacts([
    '===== VERDICT =====',
    '{',
    '  "status": "beta_candidate",',
    '  "blockers": [],',
    '  "warnings": []',
    '}',
    'JSON: C:\\tmp\\ocr.json',
    'LATEST_MD: C:\\tmp\\latest.md',
  ].join('\n'));
  assert(parsedPrettyVerdict?.verdictStatus === 'beta_candidate', 'Pretty-printed OCR eval verdict should be parsed');
  assert(parsedPrettyVerdict?.latestMd?.endsWith('latest.md'), 'OCR eval latest MD path should be parsed');
  assert(
    classifyExternalOcrEval({ allowExternal: false }) === 'HELD_FOR_EXPLICIT_USER_APPROVAL',
    'external OCR should be held without explicit approval',
  );
  assert(
    classifyExternalOcrEval({ allowExternal: true, blockedByStrictConfig: true }) === 'SKIPPED_INVALID_STRICT_CONFIG',
    'invalid strict config should be classified before OCR result',
  );
  assert(
    classifyExternalOcrEval({ allowExternal: true, actualExternalOcrOk: true, fullConfigIssueCount: 0 }) === 'RUN_AND_PASS',
    'full external OCR pass should be classified',
  );
  assert(
    classifyExternalOcrEval({ allowExternal: true, actualExternalOcrOk: true, fullConfigIssueCount: 1 }) === 'RUN_AND_PASS_PARTIAL_CONFIG',
    'partial external OCR pass should be classified',
  );
  assert(
    classifyExternalOcrEval({ allowExternal: true, artifacts: parsedManualReview }) === 'RUN_AND_NEEDS_MANUAL_REVIEW',
    'manual-review OCR verdict should be classified',
  );
  assert(
    classifyExternalOcrEval({ allowExternal: true, artifacts: parsedNeedsFix }) === 'RUN_AND_NEEDS_FIX',
    'needs-fix OCR verdict should be classified',
  );
  const utf8Text = decodeOutput(Buffer.from('MyeongBiseo readiness ok', 'utf8'));
  assert(utf8Text.includes('readiness ok'), 'UTF-8 output should decode normally');
}

function collectChangeSummary() {
  const status = spawnSync('git', ['status', '--short'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const stat = spawnSync('git', ['diff', '--stat'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const statusLines = String(status.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const trackedChanged = statusLines.filter((line) => !line.startsWith('??')).length;
  const untrackedFiles = statusLines
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .map((file) => {
      let bytes = null;
      try {
        bytes = statSync(file).size;
      } catch {
        bytes = null;
      }
      return { file, bytes };
    });
  const untracked = untrackedFiles.length;
  return {
    ok: status.status === 0 && stat.status === 0,
    trackedChanged,
    untracked,
    untrackedFiles,
    status: trimLog(status.stdout || status.stderr || '', 5000),
    stat: trimLog(stat.stdout || stat.stderr || '', 5000),
  };
}

function firstMatch(text, re) {
  const match = String(text || '').match(re);
  return match ? match[1] : '';
}

function collectBuildSummary() {
  const appJs = readFileSync('public/app.js', 'utf8');
  const swJs = readFileSync('public/sw.js', 'utf8');
  const pwaJs = readFileSync('public/pwa-register.js', 'utf8');
  const indexHtml = readFileSync('public/index.html', 'utf8');
  const betaHtml = readFileSync('public/beta.html', 'utf8');
  const scriptVersions = (html) => ({
    app: firstMatch(html, /\/app\.js\?v=([^"']+)/),
    timetable: firstMatch(html, /\/timetable\.js\?v=([^"']+)/),
    pwaRegister: firstMatch(html, /\/pwa-register\.js\?v=([^"']+)/),
  });
  return {
    appBuild: firstMatch(appJs, /MB_APP_BUILD\s*=\s*['"]([^'"]+)/),
    serviceWorkerVersion: firstMatch(swJs, /SW_VERSION\s*=\s*['"]([^'"]+)/),
    registeredServiceWorker: firstMatch(pwaJs, /register\(['"]([^'"]+)/),
    indexScripts: scriptVersions(indexHtml),
    betaScripts: scriptVersions(betaHtml),
  };
}

function deploymentDecision(report) {
  if (report.verdict === 'FAIL') {
    if (report.externalOcrEval === 'RUN_AND_NEEDS_MANUAL_REVIEW') {
      return [
        'HOLD PRODUCTION',
        'The actual OCR eval ran and reached manual-review territory. Use the OCR review/correction UX for beta feedback, but do not treat OCR quality as production-proven.',
      ];
    }
    if (report.externalOcrEval === 'RUN_AND_NEEDS_FIX') {
      return [
        'HOLD DEPLOY',
        'The actual OCR eval found blocker-level timetable errors. Fix OCR behavior, then rerun the strict full command.',
      ];
    }
    return [
      'HOLD DEPLOY',
      'At least one local/browser/syntax/protection gate failed. Fix the failing gate before beta or production deploy.',
    ];
  }
  if (report.verdict === 'FULL_OCR_GATE_PASS') {
    return [
      'PRODUCTION CANDIDATE',
      'The actual 6-image OCR eval passed after explicit approval. Final manual QA is still recommended before production deploy.',
    ];
  }
  if (report.verdict === 'EXTERNAL_OCR_PARTIAL_PASS') {
    return [
      'BETA CANDIDATE',
      'External OCR eval ran and passed, but it was not the full production OCR gate. Run the strict full command before production deploy.',
    ];
  }
  return [
    'BETA CANDIDATE',
    'Local app/browser/protection gates passed, but the actual OCR API eval is still held. Confirm FULL_OCR_GATE_PASS before treating OCR quality as production-proven.',
  ];
}

function openProofItems(report) {
  const items = [];
  if (report.preflight?.externalRunPrereqs && !report.preflight.externalRunPrereqs.ok) {
    items.push('Actual OCR run prerequisites are not ready: check API key and local dependencies.');
  }
  if (report.externalOcrEval === 'HELD_FOR_EXPLICIT_USER_APPROVAL') {
    items.push('Actual 6-image timetable OCR eval has not run because external image transfer is not explicitly approved.');
  } else if (report.externalOcrEval === 'RUN_AND_PASS_PARTIAL_CONFIG') {
    items.push('External OCR eval ran, but it used a partial/non-production config and cannot prove production OCR quality.');
  } else if (report.externalOcrEval === 'RUN_AND_NEEDS_MANUAL_REVIEW') {
    items.push('External OCR eval ran but returned manual_review_required; production OCR quality is not proven.');
  } else if (report.externalOcrEval === 'RUN_AND_NEEDS_FIX') {
    items.push('External OCR eval ran and found blocker-level OCR errors that need fixes.');
  }
  if (report.verdict !== 'FULL_OCR_GATE_PASS') {
    items.push('Production OCR quality is not proven until FULL_OCR_GATE_PASS.');
  }
  if (report.fullOcrConfigIssues?.length) {
    items.push(`Full production OCR config requirement is not met: ${report.fullOcrConfigIssues.join(' ')}`);
  }
  if (report.unusedOcrOptionIssues?.length) {
    items.push(`OCR eval options were supplied without --allow-external: ${report.unusedOcrOptionIssues.join(' ')}`);
  }
  if (report.changeSummary?.untrackedFiles?.length) {
    items.push('Untracked OCR automation scripts exist; commit them or explicitly document them as local-only before handoff, otherwise Friday readiness evidence is not reproducible from source control.');
  }
  items.push('Firebase deploy is not executed by this script. Rerun readiness after any deploy.');
  return items;
}

function sourceControlChecklist(report) {
  const items = [];
  const untracked = report.changeSummary?.untrackedFiles || [];
  if (report.changeSummary?.trackedChanged) {
    items.push(`Review ${report.changeSummary.trackedChanged} tracked changed entries before commit or deploy.`);
  }
  if (untracked.length) {
    items.push(`Commit or explicitly document ${untracked.length} untracked OCR automation files before handoff; otherwise the readiness gate cannot be reproduced from source control.`);
    for (const item of untracked) {
      items.push(`Untracked: ${item.file}`);
    }
  } else {
    items.push('No untracked files reported.');
  }
  return items;
}

function fridayDecisionChecklist(report) {
  if (report.verdict === 'FAIL') {
    if (report.externalOcrEval === 'RUN_AND_NEEDS_MANUAL_REVIEW') {
      return [
        'Decision: beta feedback only, hold production.',
        'Actual OCR eval returned manual_review_required. Keep review/correction UX enabled and inspect the OCR eval latest.md before deciding next fixes.',
        'Next command after fixes or prompt changes: `node scripts/ocr-readiness.mjs --allow-external --require-full`.',
      ];
    }
    if (report.externalOcrEval === 'RUN_AND_NEEDS_FIX') {
      return [
        'Decision: hold deploy.',
        'Actual OCR eval returned needs_fix. Fix blocker-level OCR behavior, then rerun the strict full command.',
        'Next command: `node scripts/ocr-readiness.mjs --allow-external --require-full`.',
      ];
    }
    return [
      'Decision: HOLD. At least one required gate is failing.',
      'Next command: fix the failed gate, then rerun `node scripts/ocr-readiness.mjs`.',
      'Production command after explicit external OCR approval: `node scripts/ocr-readiness.mjs --allow-external --require-full`.',
    ];
  }
  if (report.verdict === 'FULL_OCR_GATE_PASS') {
    return [
      'Decision: production candidate after manual QA.',
      'Required proof present: local/browser/protection gates passed and actual 6-image OCR eval passed.',
      'Before deploy: manually confirm the latest app flow once, then deploy only if the user asks.',
      'After deploy: rerun readiness against the deployed build or repeat the production command if OCR quality was touched.',
    ];
  }
  if (report.verdict === 'EXTERNAL_OCR_PARTIAL_PASS') {
    return [
      'Decision: beta candidate only.',
      'External OCR eval passed, but it was filtered or otherwise not the full production gate.',
      'Production command after explicit external OCR approval: `node scripts/ocr-readiness.mjs --allow-external --require-full`.',
      'Do not treat EXTERNAL_OCR_PARTIAL_PASS as production OCR quality proof.',
    ];
  }
  return [
    'Decision: beta candidate only.',
    'Required proof still missing for production: actual 6-image OCR eval.',
    'Production command after explicit external OCR approval: `node scripts/ocr-readiness.mjs --allow-external --require-full`.',
    'Do not treat LOCAL_BETA_GATE_PASS as production OCR quality proof.',
  ];
}

function manualQaChecklist(report) {
  const items = [
    'Open the beta page and upload one clean timetable image; recommendation cards should appear immediately after OCR.',
    'Upload or simulate a suspicious timetable image; the review panel, schedule warning, and food warning banner should all be visible.',
    'Edit one suspicious class day/time/room in the review panel, then click the corrected re-analysis action; the board and restaurant cards should refresh from the corrected timetable.',
    'Reload the page and run saved-timetable analysis; the saved timetable should match the confirmed/corrected timetable, not an unconfirmed suspicious OCR result.',
    'Check mobile width once: OCR review cards, action buttons, restaurant cards, and banners should not overflow horizontally.',
    'Confirm food ranking, shuttle display, and priority/banner movement still feel unchanged from the protected baseline.',
  ];
  if (report.verdict === 'FULL_OCR_GATE_PASS') {
    items.push('After deploy, hard refresh the site and confirm the visible build uses the new cache-busted JS/service worker before collecting feedback.');
  } else {
    items.push('Before production, get explicit approval for external OCR eval and pass `node scripts/ocr-readiness.mjs --allow-external --require-full`.');
  }
  return items;
}

function deploymentRunbook(report) {
  const items = [
    'Deploy only after explicit user instruction; this readiness script never deploys by itself.',
    'Before deploy, save or review this latest readiness report and confirm the working tree changes are intentional.',
    'After deploy, hard refresh the live page and beta page; confirm `window.MB_APP_BUILD` and the service worker cache version reflect the OCR review build.',
    'After deploy, repeat one clean OCR flow and one suspicious OCR flow on the deployed site before collecting feedback.',
    'Rollback trigger: OCR returns zero classes for normal images, saved timetable mixes with failed OCR, warning/review UI disappears, or food ranking/shuttle behavior visibly changes.',
    'Rollback action: restore the last known-good Firebase Hosting/Functions release or redeploy the last known-good Git commit, then rerun readiness and manual QA.',
  ];
  if (report.verdict !== 'FULL_OCR_GATE_PASS') {
    items.push('Current state is beta-only proof; production OCR quality still needs the external 6-image gate.');
  }
  return items;
}

function writeReport(report) {
  if (!WRITE_REPORT) return null;
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'latest.json');
  const mdPath = path.join(OUT_DIR, 'latest.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const [decisionTitle, decisionText] = deploymentDecision(report);
  const lines = [
    '# MyeongBiseo OCR Readiness',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Verdict: ${report.verdict}`,
    `- External OCR eval: ${report.externalOcrEval}`,
    `- Require full OCR: ${report.requireFullOcr ? 'yes' : 'no'}`,
    `- OCR eval runs per image: ${report.ocrEvalConfig.runs}`,
    `- OCR eval filter: ${report.ocrEvalConfig.filter || '(all images)'}`,
    `- OCR eval preprocess: ${report.ocrEvalConfig.preprocess}`,
    '',
    '## Build Identity',
    '',
    `- MB_APP_BUILD: ${report.buildSummary.appBuild || '(missing)'}`,
    `- Service worker cache: ${report.buildSummary.serviceWorkerVersion || '(missing)'}`,
    `- Registered service worker: ${report.buildSummary.registeredServiceWorker || '(missing)'}`,
    `- index scripts: app=${report.buildSummary.indexScripts.app || '(missing)'}, timetable=${report.buildSummary.indexScripts.timetable || '(missing)'}, pwa=${report.buildSummary.indexScripts.pwaRegister || '(missing)'}`,
    `- beta scripts: app=${report.buildSummary.betaScripts.app || '(missing)'}, timetable=${report.buildSummary.betaScripts.timetable || '(missing)'}, pwa=${report.buildSummary.betaScripts.pwaRegister || '(missing)'}`,
    '',
    ...(report.preflight
      ? [
          '## Image Set Preflight',
          '',
          `- images: ${report.preflight.imageCount}`,
          `- truth classes: ${report.preflight.totalTruth}`,
          `- 09:00 classes: ${report.preflight.nineAmTruth}`,
          `- evening classes: ${report.preflight.eveningTruth}`,
          `- max image bytes: ${report.preflight.maxBytes}`,
          `- full production OCR config: ${report.preflight.config?.fullProductionConfig ? 'yes' : 'no'}`,
          `- external OCR run prerequisites: ${report.preflight.externalRunPrereqs?.ok ? 'ready' : 'not ready'}`,
          `- API key source: ${report.preflight.externalRunPrereqs?.apiKeySource || 'missing'}`,
          '',
        ]
      : []),
    '## Gates',
    ...report.results.map((r) => `- ${r.ok ? 'PASS' : 'FAIL'} ${r.label} (${r.ms}ms): \`${r.cmd}\``),
    '',
    ...(report.actualOcrEvalArtifacts
      ? [
          '## Actual OCR Eval Artifacts',
          '',
          `- verdict status: ${report.actualOcrEvalArtifacts.verdictStatus || '(unknown)'}`,
          ...(report.actualOcrEvalArtifacts.blockers?.length
            ? [`- blockers: ${report.actualOcrEvalArtifacts.blockers.join(' / ')}`]
            : []),
          ...(report.actualOcrEvalArtifacts.warnings?.length
            ? [`- warnings: ${report.actualOcrEvalArtifacts.warnings.join(' / ')}`]
            : []),
          `- JSON: ${report.actualOcrEvalArtifacts.json || '(missing)'}`,
          `- MD: ${report.actualOcrEvalArtifacts.md || '(missing)'}`,
          `- latest JSON: ${report.actualOcrEvalArtifacts.latestJson || '(missing)'}`,
          `- latest MD: ${report.actualOcrEvalArtifacts.latestMd || '(missing)'}`,
          '',
        ]
      : []),
    ...(report.changeSummary
      ? [
          '## Change Summary',
          '',
          `- tracked changed entries: ${report.changeSummary.trackedChanged}`,
          `- untracked entries: ${report.changeSummary.untracked}`,
          '',
          ...(report.changeSummary.untrackedFiles?.length
            ? [
                '### Untracked Files',
                '',
                ...report.changeSummary.untrackedFiles.map((item) => `- ${item.file}${item.bytes == null ? '' : ` (${item.bytes} bytes)`}`),
                '',
              ]
            : []),
          '### git diff --stat',
          '',
          '```',
          report.changeSummary.stat || '(no tracked diff)',
          '```',
          '',
          '### git status --short',
          '',
          '```',
          report.changeSummary.status || '(clean)',
          '```',
          '',
          '## Source Control Checklist',
          '',
          ...sourceControlChecklist(report).map((item) => `- ${item}`),
          '',
        ]
      : []),
    '## Local Coverage',
    '',
    '- OCR review smoke: detects empty OCR, low class count, weekend/off-day hallucination, long block risk, room/building mismatch, and missing today-column risk.',
    '- Browser smoke: covers index OCR, beta OCR, OCR escaping, suspicious-OCR warning banners, saved timetable analysis, API failure recovery, quick actions, index/beta edited-field correction re-analysis, and mobile/desktop overflow checks.',
    '- Actual OCR eval harness: self-tests blockers for missing/hallucinated classes, wrong building, 09:00 movement, off-day hallucination, zero-class OCR, and run instability criteria.',
    '- Readiness self-test: blocks strict production config mistakes such as filtered evals, one-run evals, and invalid run counts.',
    '- Script protection: syntax checks for OCR smoke/eval/local-check/readiness/probe scripts.',
    '- Ranking/shuttle guard: checks protected ranking functions/score helpers and shuttle schedule/rendering sections against HEAD.',
    '- Timetable guard: verifies evening OCR normalization, room-prefix building mapping, schedule prompt guardrails, app load probe, and function syntax.',
    '- Distance guard: checks building labels, restaurant distances, and complete symmetric B2B matrix.',
    '- Firebase guard: checks default project, hosting public dir, API rewrite, cache headers, functions predeploy, and public/functions data sync.',
    '- Cache guard: checks index/beta script cache-busting and service worker cache version.',
    '',
    '## Deployment Decision',
    '',
    `- ${decisionTitle}: ${decisionText}`,
    '',
    '## Friday Decision Checklist',
    '',
    ...fridayDecisionChecklist(report).map((item) => `- ${item}`),
    '',
    '## Manual QA Checklist',
    '',
    ...manualQaChecklist(report).map((item) => `- ${item}`),
    '',
    '## Deployment And Rollback Runbook',
    '',
    ...deploymentRunbook(report).map((item) => `- ${item}`),
    '',
    '## Open Proof Items',
    '',
    ...openProofItems(report).map((item) => `- ${item}`),
    '',
    '## Plain Summary',
    '',
    `- Local gate: ${report.verdict === 'FAIL' ? 'blocked' : 'passed'}.`,
    `- Beta decision: ${report.verdict === 'FAIL' ? 'do not deploy' : 'beta deploy candidate after manual review'}.`,
    `- Production decision: ${report.verdict === 'FULL_OCR_GATE_PASS' ? 'candidate after manual QA' : 'not proven until actual OCR eval passes'}.`,
    `- Actual OCR eval: ${report.externalOcrEval}.`,
    `- Production strict mode: ${report.requireFullOcr ? 'enabled' : 'disabled'}.`,
    `- External OCR prerequisites: ${report.preflight?.externalRunPrereqs?.ok ? 'ready' : 'not ready'}.`,
    '- For strict Friday/production judgment after explicit external OCR approval, run: `node scripts/ocr-readiness.mjs --allow-external --require-full`.',
    '- Exploratory external OCR command, not production proof: `node scripts/ocr-readiness.mjs --allow-external`.',
    '- Current local browser coverage includes index OCR, beta OCR, OCR escaping, suspicious-OCR warning banners, saved timetable analysis, API failure recovery, quick actions, index/beta edited-field correction re-analysis, and mobile/desktop overflow checks.',
    '- Protected areas checked: ranking functions/score helpers, shuttle schedule/rendering sections, Firebase deploy config, service worker cache version, data sync, building distance matrix, room prefix mapping, and OCR prompt guardrails.',
    '',
    '## Notes',
    '- Actual 6-image timetable OCR eval is held until explicit approval to send personal timetable images to the external API.',
    '- LOCAL_BETA_GATE_PASS means all non-external local/browser/ranking/syntax/protection/image-preflight gates passed.',
    '- EXTERNAL_OCR_PARTIAL_PASS means external OCR ran but did not use the full production OCR config.',
    '- FULL_OCR_GATE_PASS means the actual 6-image OCR regression also passed after external-transfer approval.',
  ];
  writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf8');
  return { jsonPath, mdPath };
}

if (SELF_TEST) {
  runSelfTest();
  console.log('ocr-readiness self-test ok');
  process.exit();
}

const strictConfigIssues = strictOcrConfigIssues();
const fullOcrConfigIssues = strictOcrConfigIssues({ requireFull: true });
const unusedOptionIssues = unusedOcrOptionIssues();
const externalEvalBlockedByStrictConfig = ALLOW_EXTERNAL_OCR && REQUIRE_FULL_OCR && strictConfigIssues.length > 0;
const evalArgs = ALLOW_EXTERNAL_OCR
  ? [
      'scripts/ocr-eval.mjs',
      '--allow-external',
      '--runs',
      OCR_RUNS,
      '--preprocess',
      OCR_PREPROCESS,
      ...(OCR_FILTER ? ['--filter', OCR_FILTER] : []),
    ]
  : ['scripts/ocr-eval.mjs'];
const externalEvalCmd = ['node', ...evalArgs].join(' ');

const results = [
  run('local OCR/app regression gate', 'node', ['scripts/ocr-local-check.mjs'], {
    env: { ...process.env, MB_REQUIRE_BROWSER_SMOKE: '1' },
  }),
  run('OCR image set preflight', 'node', ['scripts/ocr-eval.mjs', '--preflight']),
  run('functions syntax/lint gate', 'npm', ['--prefix', 'functions', 'run', 'lint']),
  run('diff whitespace gate', 'git', ['diff', '--check']),
  externalEvalBlockedByStrictConfig
    ? {
        label: 'actual OCR image eval gate',
        cmd: externalEvalCmd,
        ok: false,
        status: 2,
        ms: 0,
        stdout: '',
        stderr: `Skipped external OCR eval because strict production config is invalid:\n${strictConfigIssues.join('\n')}`,
      }
    : run(
        ALLOW_EXTERNAL_OCR ? 'actual OCR image eval gate' : 'external OCR eval guard',
        'node',
        evalArgs,
        ALLOW_EXTERNAL_OCR ? { env: { ...process.env, MB_ALLOW_EXTERNAL_OCR: '1' } } : {},
      ),
];

let externalGuardOk = false;
let actualExternalOcrOk = false;
for (const result of results) {
  if (result.label === 'external OCR eval guard') {
    externalGuardOk =
      result.status === 2 &&
      `${result.stdout}\n${result.stderr}`.includes('Refusing to run OCR eval');
    printResult({ ...result, ok: externalGuardOk });
  } else if (result.label === 'actual OCR image eval gate') {
    actualExternalOcrOk = result.ok;
    printResult(result);
  } else {
    printResult(result);
  }
}

const hardFailures = results.filter((r) => !['external OCR eval guard', 'actual OCR image eval gate'].includes(r.label) && !r.ok);
if (ALLOW_EXTERNAL_OCR) {
  if (!actualExternalOcrOk) hardFailures.push(results.find((r) => r.label === 'actual OCR image eval gate'));
} else if (!externalGuardOk) {
  hardFailures.push(results.find((r) => r.label === 'external OCR eval guard'));
}

const preflightResult = results.find((r) => r.label === 'OCR image set preflight');
const preflight = preflightResult?.ok ? parsePreflight(preflightResult.stdout) : null;
let unusedOptionResult = null;
if (unusedOptionIssues.length) {
  unusedOptionResult = {
    label: 'unused OCR option gate',
    cmd: process.argv.slice(2).join(' ') || '(none)',
    ok: false,
    status: 2,
    ms: 0,
    stdout: '',
    stderr: unusedOptionIssues.join('\n'),
  };
  hardFailures.push(unusedOptionResult);
  printResult(unusedOptionResult);
}
let preflightConfigResult = null;
if (preflight && !preflight.config?.fullProductionConfig) {
  preflightConfigResult = {
    label: 'OCR image set full-config gate',
    cmd: 'node scripts/ocr-eval.mjs --preflight',
    ok: false,
    status: 2,
    ms: 0,
    stdout: '',
    stderr: 'Default OCR preflight must cover all configured images with at least 2 runs per image.',
  };
  hardFailures.push(preflightConfigResult);
  printResult(preflightConfigResult);
}
const baseVerdict = baseReadinessVerdict({
  hasHardFailures: hardFailures.length > 0,
  allowExternal: ALLOW_EXTERNAL_OCR,
  fullConfigIssueCount: fullOcrConfigIssues.length,
});
let verdict = baseVerdict;
let strictProductionResult = null;
if (REQUIRE_FULL_OCR && (baseVerdict !== 'FULL_OCR_GATE_PASS' || strictConfigIssues.length)) {
  strictProductionResult = {
    label: 'production strict OCR gate',
    cmd: '--require-full',
    ok: false,
    status: 2,
    ms: 0,
    stdout: '',
    stderr: [
      ...(baseVerdict !== 'FULL_OCR_GATE_PASS' ? ['FULL_OCR_GATE_PASS is required for production strict mode.'] : []),
      ...strictConfigIssues,
    ].join('\n'),
  };
  hardFailures.push(strictProductionResult);
  verdict = 'FAIL';
  printResult(strictProductionResult);
}
const changeSummary = collectChangeSummary();
const actualOcrResult = results.find((r) => r.label === 'actual OCR image eval gate');
const actualOcrEvalArtifacts = actualOcrResult ? parseOcrEvalArtifacts(actualOcrResult.stdout) : null;
const externalOcrEval = classifyExternalOcrEval({
  allowExternal: ALLOW_EXTERNAL_OCR,
  blockedByStrictConfig: externalEvalBlockedByStrictConfig,
  actualExternalOcrOk,
  fullConfigIssueCount: fullOcrConfigIssues.length,
  artifacts: actualOcrEvalArtifacts,
});
const report = {
  generatedAt: nowKstIso(),
  verdict,
  baseVerdict,
  requireFullOcr: REQUIRE_FULL_OCR,
  strictOcrConfigIssues: strictConfigIssues,
  fullOcrConfigIssues,
  unusedOcrOptionIssues: unusedOptionIssues,
  buildSummary: collectBuildSummary(),
  ocrEvalConfig: {
    runs: OCR_RUN_COUNT,
    filter: OCR_FILTER,
    preprocess: OCR_PREPROCESS,
  },
  externalOcrEval,
  preflight: preflight
    ? {
        imageCount: preflight.imageCount,
        totalTruth: preflight.totalTruth,
        nineAmTruth: preflight.nineAmTruth,
        eveningTruth: preflight.eveningTruth,
        maxBytes: preflight.maxBytes,
        config: preflight.config
          ? {
              runs: preflight.config.runs,
              filter: preflight.config.filter || '',
              preprocess: preflight.config.preprocess || 'none',
              selectedImageCount: preflight.config.selectedImageCount,
              configuredImageCount: preflight.config.configuredImageCount,
              fullProductionConfig: !!preflight.config.fullProductionConfig,
            }
          : null,
        externalRunPrereqs: preflight.externalRunPrereqs
          ? {
              ok: !!preflight.externalRunPrereqs.ok,
              apiKeySource: preflight.externalRunPrereqs.apiKeySource || null,
              dependencies: Object.fromEntries(
                Object.entries(preflight.externalRunPrereqs.dependencies || {}).map(([name, dep]) => [
                  name,
                  { ok: !!dep.ok },
                ]),
              ),
            }
          : null,
      }
    : null,
  changeSummary,
  actualOcrEvalArtifacts,
  results: [
    ...results,
    ...(unusedOptionResult ? [unusedOptionResult] : []),
    ...(preflightConfigResult ? [preflightConfigResult] : []),
    ...(strictProductionResult ? [strictProductionResult] : []),
  ].map((r) => ({
    label: r.label,
    cmd: r.cmd,
    ok: r.label === 'external OCR eval guard' ? externalGuardOk : r.ok,
    status: r.status,
    ms: r.ms,
    stdout: trimLog(r.stdout),
    stderr: trimLog(r.stderr),
  })),
};
const reportPaths = writeReport(report);

console.log('');
if (hardFailures.length) {
  console.log('READINESS: FAIL');
  if (reportPaths) console.log(`REPORT: ${reportPaths.mdPath}`);
  process.exit(1);
}

console.log(`READINESS: ${verdict}`);
console.log(
  ALLOW_EXTERNAL_OCR
    ? 'NOTE: actual 6-image OCR eval was included in this readiness run.'
    : 'NOTE: actual 6-image OCR eval is intentionally held until explicit external-transfer approval.',
);
if (reportPaths) console.log(`REPORT: ${reportPaths.mdPath}`);
