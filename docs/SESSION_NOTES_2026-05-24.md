# セッションノート 2026-05-24 — Phase 1.3a〜1.3d 完了

> 次セッションで素早く再開するためのノート。状態確認コマンド・再開手順・注意事項をコピペ可能な形でまとめる。

---

## 1. 今日の到達点

- **Phase 1.3a**: フロントエンド計画書を作成（`docs/PHASE_1_3a_FRONTEND_PLAN.md`）。CLAUDE.md を Phase 1.2 実体（コード.js 812行）に同期。
- **Phase 1.3b**: features 受領・保持（`normalizeFeatures` フォールバック）/ エラー文言コントラクト（`error.includes('認証')` 廃止 → 文言リスト判定）/ 残骸クリーンアップ。**実装・push 済み**。
- **Phase 1.3c**: 出力先セレクタ（商品別/店舗別トグル、action 分岐）/ features ゲート / 変倍率レンジ動的化 / 店舗別 disabled 入口。**実装・push 済み**。
- **Phase 1.3d**: 「個別設定しない」の器（`ENABLE_CLEAR_SETTING=false`）を OFF で実装。**実装・push 済み**。
- 各フェーズで `node --check`（インラインJS構文）通過。

### コミット（すべて origin/main に push 済み）
```
0c33d39 feat(frontend): Phase 1.3d 個別設定しない の器（ENABLE_CLEAR_SETTING）を OFF で実装
71f23fe feat(frontend): Phase 1.3c 出力先セレクタ・featuresゲート・変倍率レンジ動的化
dbf94bb feat(frontend): Phase 1.3b features受領・エラー文言コントラクト対応・残骸クリーンアップ
6d73a6d docs: Phase 1.3a フロントエンド計画書を作成、CLAUDE.md を Phase 1.2 実体に同期
```

---

## 2. 現在のデプロイ状態（次回確認用）

| 対象 | 状態 |
|------|------|
| **フロント（index.html / GitHub Pages）** | ⚠️ **既に本番反映済み**。main へ push 済みのため https://pointup.ginzasugiden.com/ は Phase 1.3b〜d 入りの新フロントを配信中 |
| **本番 GAS URL**（`AKfycbwDk1Tx…/exec`） | **version 8「商品選択Ver」固定（旧コード 566行）**。フロントが叩く先はこれ |
| **GAS HEAD デプロイ**（`AKfycbxZQ99…`） | Phase 1.2（812行）を配信中。検証用に使う |
| **本番シート** `account_services` / `service_rpointup` | **未整備（fail-open）** |
| **scriptId** | `1zMndANFbPRc3AjIh4GCLjHayfEALRZcL5puAOjOwa59CevPrOBkT4GKz` |

### ⚠️ 重要：現在「新フロント＋旧GAS」で稼働中だが壊れていない
本番サイトは新フロント（1.3b〜d）が **version 8（features を返さない旧GAS）** を叩いている。後方互換が効くため正常動作する：
- `normalizeFeatures(undefined)` → `{item_point:true, shop_point:true}`（フォールバックで商品別有効・店舗別は disabled のまま）。
- 旧GAS の認証エラー文言（`認証に失敗しました…` / `API認証情報が設定されていません`）は `AUTH_STATUS_ERROR_MESSAGES` に含まれるので認証ステータス領域に正しく出る。
- 店舗別は disabled・`ENABLE_CLEAR_SETTING=false` なので新アクションは呼ばれない。

→ **redeploy は未実施。本番 GAS を Phase 1.2/1.3 にするのは検証＋シート整備後（Step 7〜8）。**

---

## 3. 次セッション開始時のチェックコマンド（コピペ可）

```powershell
# 1) Git 状態（クリーン＆ origin と一致しているか）
git status -sb
git log --oneline -5
#   期待: 0c33d39 が HEAD。"## main...origin/main"（ahead/behind なし）

# 2) ローカル・push 状態が変わっていないか
git log origin/main..HEAD --oneline   # 期待: 出力なし（未pushなし）
git fetch origin; git log HEAD..origin/main --oneline   # 期待: 出力なし（遅れなし）

# 3) 本番デプロイ確認（リポジトリ root から。.clasp.json の scriptId を使用）
clasp deployments
#   期待:
#     AKfycbxZQ99…  @HEAD            ← Phase 1.2 配信（検証用）
#     AKfycbwDk1Tx… @8 - 商品選択Ver ← 本番URL（旧コード。まだ version 8 のはず）

# 4) GAS HEAD が Phase 1.2 のままか（任意・確認したい場合）
#    一時ディレクトリに pull して 812 行・features 有無を確認（読み取りのみ・安全）
```

> もし `clasp deployments` で本番（`AKfycbwDk1Tx…`）が @8 以外（@9 など）になっていたら、**誰かが redeploy 済み**＝状態が変わっている。その場合は本ノート Step 7〜9 を飛ばして回帰確認から。

---

## 4. 次セッションの実行手順（時短版・所要時間付き）

> 目的: 1.3b〜d を実機検証 → 問題なければ本番 GAS を Phase 1.2/1.3 へ redeploy。
> 計画書 `docs/PHASE_1_3a_FRONTEND_PLAN.md` の 10 章が詳細版。本節はその時短ガイド。
> **合計目安: 約 60〜90 分**

### Step 1: テスト用スプレッドシート準備（約10分）
- スプレッドシート（scriptId のプロパティ `SPREADSHEET_ID`）を開く。
- `api_key` シートに**テスト専用店舗** `test_dummy_shop` を1行追加（本番店舗idは使わない）。
  - 列: `id=test_dummy_shop`, `pw`（`BASE64:` 付き）, `serviceSecret`/`licenseKey`（検証用ダミー可。検索は失敗してよい。認証ゲートの文言検証が目的）, `sid`/`sname`/`email` は任意。
- `account_services` / `service_rpointup` シートを新規作成し、`test_dummy_shop` の行のみ投入（計画書 10-0b の表に従う）。
- **期待結果**: テスト店舗で各 Layer のエラー文言を発火できる状態。

### Step 2: GAS_WEB_APP_URL を HEAD デプロイへ切替（約3分）
- `index.html` の `const GAS_WEB_APP_URL`（**720行付近**。`grep -n GAS_WEB_APP_URL index.html` で特定）を
  HEAD デプロイの /exec URL に一時変更:
  ```
  https://script.google.com/macros/s/AKfycbxZQ99XbldwxVhE3AbqSPDsKhOM_XJl6X4ElFea9Nf8/exec
  ```
  （※ HEAD の deploymentId は `clasp deployments` の @HEAD 行で要確認）
- **この変更は絶対に commit/push しない**（Step 6 で revert）。
- **期待結果**: ブラウザでローカル `index.html` を開くと Phase 1.2 GAS（features 返却・新文言）を叩く。

### Step 3: 1.3b 検証（約15分）— 計画書 10-1
- ローカル `index.html` をブラウザで開き DevTools を開く。
- [ ] 正常店舗で検索 → `authenticatedShop.features` に `{item_point, shop_point}` 保持。
- [ ] `is_active=FALSE` → 「このサービスの利用権がありません」が**認証ステータス領域**に。
- [ ] `expires_at` 過去日付 → 「ご契約が無効です。…」。
- [ ] 店舗別アクション（DevTools で `updateShopPointCampaign` を直接 POST 等）→ 「この機能は現在のプランでは…」/「店舗別ポイント変倍は現在ご利用いただけません。…」。
- [ ] 4文言が新ロジック（`isAuthStatusError`）で振り分けられる。

### Step 4: 1.3c 検証（約15分）— 計画書 10-2
- [ ] `item_point=true/false` で商品別 UI の有効/disabled＋案内が切替。
- [ ] `shop_point=true` → 店舗別タブが「Phase2 提供予定」で disabled 表示。`false` → 非表示。
- [ ] 出力先=商品別で変倍率 `min=1`、店舗別（DevTools で radio を一時有効化）で `min=2`。
- [ ] 送信プレビューの `action` が出力先で分岐。

### Step 5: 1.3d 検証（約5分）— 計画書 10-3
- [ ] `ENABLE_CLEAR_SETTING=false`（既定）→「個別設定しない」UI 非表示・既存挙動に影響なし。
- [ ] `ENABLE_CLEAR_SETTING=true`（一時変更）→ 変倍率エリアに選択肢出現（送信は未実装でよい）。検証後 false に戻す。
- [ ] フラグが features 非依存（店舗変更で挙動不変）。

### Step 6: クリーンアップ（約5分）
- テストシート行を削除（`account_services` / `service_rpointup` の `test_dummy_shop` 行、`api_key` の `test_dummy_shop`）。行を消せば再び fail-open に戻る。
- `index.html` の `GAS_WEB_APP_URL` を**本番に戻す**:
  ```powershell
  git checkout -- index.html      # or: git stash drop で退避分を破棄
  git status -sb                  # クリーンを確認
  ```
- **期待結果**: 作業ツリーがクリーン、URL は本番に戻っている。

### Step 7: 本番シート整備（約10分）
- `account_services` / `service_rpointup` を**本番店舗**で正規整備（fail-open → 正規運用へ）。
- 列定義は計画書 10-0b / ARCHITECTURE.md 4.2 を参照。
- **redeploy より先に必ず実施**（順序厳守。理由は §5）。

### Step 8: clasp redeploy（約5分）
- **事前に現 deploymentId をメモ**（ロールバック用）:
  ```powershell
  clasp deployments    # AKfycbwDk1Tx… @8 をメモ
  ```
- 本番デプロイを新バージョンへ（URL 不変）:
  ```powershell
  clasp push           # HEAD が既に Phase 1.2 のため実質 no-op（安全確認）
  clasp redeploy AKfycbwDk1TxHZL7lUtYmccXj5q5-YW_CI7W_x2QQp88NB6JDiD8cKC3-KJRUy2y3g_InBTdEw -d "Phase 1.2/1.3"
  ```
- **期待結果**: `clasp deployments` で本番が @9 以降（Phase 1.2 入り）に。

### Step 9: 本番回帰確認（約10分）
- https://pointup.ginzasugiden.com/ で本番店舗ログイン → 検索 → 商品別設定が通る。
- features に応じた UI、エラー文言が本番でも正しく出る。
- 問題あれば Step 8 でメモした旧 deploymentId 情報を使い、`clasp redeploy <id> -V 8` 等で version 8 へロールバック。

---

## 5. セキュリティ／事故防止（次回作業者＝Claude Code 向け）

- **テスト行は本番店舗 id を使わず `test_dummy_shop` で。** 本番店舗のシート行は検証中も**絶対に触らない**。
- **`GAS_WEB_APP_URL` の切替は git stash / git checkout で管理し、push 事故を防ぐ。** HEAD URL のまま commit/push すると本番フロントが検証用 GAS を叩いてしまう。
- **redeploy 前に現 deploymentId（`AKfycbwDk1Tx…` @8）を必ずメモ。** ロールバックに使う。
- **「シート整備 → redeploy」の順序を厳守。** 逆（redeploy 先）だと、シート未整備の瞬間に Layer1/2 が fail-open のまま本番に出る隙が生じる。
- redeploy は GAS（コード.js）のみ反映。フロント（index.html）は GitHub Pages 側で main push により別途反映される点に注意（混同しない）。

---

## 6. 未決事項（持ち越し）

| # | 事項 | 状態 |
|---|------|------|
| 1 | 「個別設定しない」の API 実現方式 | 楽天サポート回答待ち。回答後に `ENABLE_CLEAR_SETTING` を true 化し本実装（C 章） |
| 2 | GSD アカウント基盤 Phase | 別計画（契約状態/role/errorCode の標準化。計画書 E 章） |
| 3 | Phase 2 店舗別ポイント変倍 | Python RPA で本実装。店舗別 disabled を解除＋変倍率 2〜20 を GAS/RPA でも検証 |

---

## 参照
- 計画書: `docs/PHASE_1_3a_FRONTEND_PLAN.md`（10章=検証手順、8章=デプロイ整合）
- 設計原則: `ARCHITECTURE.md`（Layer 0/1/2、シート定義 4.2）
- 固有仕様: `CLAUDE.md`（出力先択一・変倍率範囲・優先順位・保留機能）
