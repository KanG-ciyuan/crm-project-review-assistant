# Homepage Theme Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the CRM analysis tool with the product homepage's blue-and-white visual system without changing layout, behavior, report content, or motion timing.

**Architecture:** Treat the homepage palette as the source of truth and expose the matching blue tokens in the final-loaded `tool-theme.css` layer. Keep semantic risk/review/observation colors independent, and protect the final cascade and responsive behavior with stylesheet tests plus rendered browser checks.

**Tech Stack:** React, TypeScript, CSS, Vitest, Vite, in-app browser QA.

---

### Task 1: Lock the final blue-and-white theme contract

**Files:**
- Modify: `src/review.css.test.ts`
- Reference: `src/landing.css`
- Reference: `src/tool-theme.css`

- [ ] **Step 1: Write the failing theme assertions**

Add assertions that the final-loaded theme uses the homepage blue family and does not reintroduce the temporary green accent:

```ts
it('uses the homepage blue family in the final workbench theme layer', () => {
  expect(themeCss).toMatch(/--accent:\s*#405ad7/);
  expect(themeCss).toMatch(/--accent-strong:\s*#293c9b/);
  expect(themeCss).toMatch(/--focus:\s*#405ad7/);
  expect(themeCss).not.toMatch(/--accent:\s*#126466/);
  expect(themeCss).toMatch(/\.sidebar\s*\{[\s\S]*?background:\s*#f6f7fa/);
  expect(themeCss).toMatch(/\.brand-mark\s*\{[\s\S]*?background:\s*#405ad7/);
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm test -- --run src/review.css.test.ts`

Expected: FAIL because the current final theme still declares green `#126466` and `#0b5153` tokens.

- [ ] **Step 3: Commit the red contract only after confirming failure output**

Do not commit yet; continue directly to the minimal implementation so the branch never ends on a knowingly failing commit.

### Task 2: Apply homepage blue tokens without changing motion or semantics

**Files:**
- Modify: `src/tool-theme.css`
- Modify: `src/review.css.test.ts`

- [ ] **Step 1: Replace only the final presentation tokens and direct green declarations**

In the final `:root` and final presentation overrides, use:

```css
:root {
  --accent: #405ad7;
  --accent-strong: #293c9b;
  --focus: #405ad7;
  --focus-on-dark: #aeb9e8;
}

.sidebar { background: #f6f7fa; }
.brand-mark,
.upload-button { background: #405ad7; border-color: #405ad7; color: #fff; }
.brand-mark:hover,
.upload-button:hover { background: #293c9b; }
```

Keep `--risk`, `--review`, `--observation`, every `@keyframes`, all transition durations, responsive grid rules, and business components unchanged.

- [ ] **Step 2: Run focused tests and verify green**

Run: `npm test -- --run src/review.css.test.ts`

Expected: all stylesheet tests PASS.

- [ ] **Step 3: Run complete verification**

Run: `npm test -- --run && npm run build && git diff --check`

Expected: all tests PASS, Vite build exits 0, and diff check prints no errors. The pre-existing large-chunk warning is allowed.

- [ ] **Step 4: Verify rendered desktop and mobile continuity**

At `1440x900` and `390x844`, verify:

```text
主页蓝白 -> 进入分析工具 -> 蓝白侧栏、蓝色按钮与选中态
分析标签切换 -> 原有淡入/进度动效仍存在
打开报告预览 -> 蓝白抽屉、无绿色主色、页面无横向溢出
```

Check the browser console for relevant errors and confirm `prefers-reduced-motion` rules remain present.

- [ ] **Step 5: Commit the theme alignment**

```bash
git add src/tool-theme.css src/review.css.test.ts
git commit -m "fix: align workbench theme with homepage"
```
