# PHASE_1_3a_FRONTEND_PLAN.md — ポイント変倍侍 フロントエンド改修計画（Phase 1.3a）

> **本書の位置づけ**: 設計計画書（**計画のみ。コード変更は含まない**）。
> 実装は 1.3b 以降に分割して行う（→ 7章）。

## 0. メタ情報

| 項目 | 内容 |
|------|------|
| 作成日 | 2026-05-24 |
| Phase | 1.3a（フロントエンド計画策定） |
| 前提 | Phase 1.2（GAS層 Layer1/2 認証認可・`features`・店舗別スタブ）**コードは完了** |
| ⚠️ デプロイ状態 | **本番 WebApp は未反映**。本番URL（`AKfycbwDk1Tx…/exec`）はデプロイ version 8「商品選択Ver」に固定され、**566行の Phase 1.2 以前コード**を配信中。GAS プロジェクト HEAD は Phase 1.2（812行）だが、本番デプロイは redeploy されていない（→ 8章） |
| インプット | `ARCHITECTURE.md`（全体方針） / `CLAUDE.md`（固有仕様。ただし「コード.js 566行」は**陳腐化。実体812行をソースとして正**とする） / `コード.js`（Phase 1.2 完了時点 812行） / `index.html`（1384行・Phase 1.2 以降ノータッチ） |
| マーカー | ★確定方針 / ☆未確定・要相談 / ⚠️注意・リスク |

### スコープ宣言
- **1.3a に含む**: 設計と棚卸しのみ（A〜F）。
- **1.3a に含まない（委譲先を明示）**:
  - GSD アカウント基盤連携の実装（契約状態・role 表示など）→ 別Phase（E章）
  - 店舗別ポイント変倍の本実装 → Phase 2（Python RPA、D章）
  - 「個別設定しない」の本実装 → 楽天サポート回答後（C章）

---

## 1. 現状サマリ（出発点）

- フロントは**単一モード（商品別のみ）**。出力先（商品別/店舗別）を選ぶ UI は存在しない。
- 変倍率スライダーは `min="1" max="20" value="2"`（`index.html:655`）。出力先による範囲切替なし。
- GAS は Phase 1.2 で全レスポンスに `features:{item_point, shop_point}` を返すが、**フロントは一切参照していない**（`searchItems` 応答処理 `index.html:963-976`、`submitData` 応答処理 `index.html:1340-1363`）。
- 認証は専用ログイン無し。初回検索が暗黙の認証を兼ね、成否を `result.shopName`（成功）/ `result.error.includes('認証')`（失敗）で判定。

---

## 2. セクションA — 現 index.html の旧コントラクト依存 棚卸し

現フロントが GAS コントラクトに依存している全箇所。「Phase 1.2 での変化」「対応要否」を併記。

### A-1. リクエスト送出

| # | 箇所 | 送出フィールド | Phase 1.2 での変化 | 対応 |
|---|------|----------------|---------------------|------|
| A1a | `searchItems()` `index.html:947-953` | `action:'searchItems'`, `shopId`, `password`, `keyword`, `cursorMark` | 変化なし（後方互換） | 不要 |
| A1b | `submitData()` `index.html:1303-1317` | `action:'updatePointCampaignWithAuth'`, `shopId`, `password`, `manageNumbers[]`, `pointCampaign.applicablePeriod.{start,end}`, `pointCampaign.benefits.pointRate` | 変化なし。ただし**出力先の概念が無い**（常に商品別） | B章で出力先フィールド追加を設計 |

### A-2. レスポンス受領

| # | 箇所 | 参照フィールド | Phase 1.2 での変化 | 対応 |
|---|------|----------------|---------------------|------|
| A2a | `searchItems()` `index.html:963-976` | `result.success` / `result.shopName` / `result.items` / `result.totalCount` / `result.nextCursorMark` / `result.error` | これらは不変。**`result.features` が追加されたが未参照**（`コード.js:349`） | B章で `features` 受領 |
| A2b | `displaySearchResults()` `index.html:1014-1031` | `item.manageNumber` / `item.title` / `item.price` | 商品オブジェクト形状は不変 | 不要 |
| A2c | `submitData()` `index.html:1340-1363` | `result.success` / `result.results[]`（各 `{success, manageNumber, error}`）/ `result.shopName` / `result.error` | これらは不変。**`result.features` 追加・未参照**（`コード.js:401`） | B章で `features` 受領 |
| A2d | `showResultsDetail()` `index.html:1373-1380` | `r.success` / `r.manageNumber` / `r.error` | 不変 | 不要 |

### A-3. ⚠️ 認証成否判定のコントラクト・ドリフト（最重要）

現フロントは認証エラーを **文字列 `'認証'` の包含**で判定している（`index.html:971`, `index.html:1359`）。

```js
if (result.error && result.error.includes('認証')) { /* 認証エラー扱い */ }
```

ところが Phase 1.2 は `authenticateShop` に**新しいエラー文言**を追加した（いずれも `'認証'` を含まない）:

| 文言 | 発生条件 | 場所 |
|------|----------|------|
| `このサービスの利用権がありません` | account_services で `is_active≠true` | `コード.js:200` |
| `ご契約が無効です。ご契約状況をご確認ください` | account_services の `expires_at` 失効 | `コード.js:205` |
| `この機能は現在のプランではご利用いただけません` | 店舗別で `shop_point≠true` | `コード.js:430` |
| `店舗別ポイント変倍は現在ご利用いただけません。お問い合わせください。` | 店舗別スタブ（未実装） | `コード.js:438` |

⚠️ これらは現フロントでは**「認証ステータス」ではなく汎用エラー**として表示される。
現状は account_services / service_rpointup シート未整備＝**fail-open**（`コード.js:209`）なので実害は出ていないが、シート整備後（=本番デプロイ後）に顕在化する。→ **B章でエラー文言コントラクトを構造化**。

### A-4. 既知の残骸（変更時に除去候補）
- `<iframe id="submitFrame">`（`index.html:717`）: 宣言のみ・未参照。
- `formatDateTimeLocal()` / `formatToISO8601JST()`: 定義のみ・未使用。
- `shops` 変数: 実質未使用。
- → 1.3b 着手時にクリーンアップ対象として明記（機能には無関係）。

---

## 3. セクションB — Phase 1.2 新コントラクトの消費設計

### B-1. `features` の受領・保持 ★
- `searchItems` 応答（`コード.js:349`）と `updatePointCampaignWithAuth` 応答（`コード.js:401`）の `result.features` を、
  グローバル状態 `authenticatedShop`（`index.html:727`）に保持する。
  ```
  authenticatedShop = { shopName, features: { item_point, shop_point } }
  ```
- 初回検索（=暗黙認証）成功時に確定。以後の UI ゲートに使用。
- ☆ `features` が応答に**無い**場合（旧デプロイ＝現本番が応答するケース）は「全機能利用可」とみなすフォールバックを設ける（後方互換）。

### B-2. `features` に応じた UI ゲート ★
| features | UI 挙動 |
|----------|---------|
| `item_point === true` | 商品別 設定 UI を有効化（現行どおり） |
| `item_point === false`（かつ応答に features あり） | 商品別 UI を disabled ＋「このプランでは商品別をご利用いただけません」案内 |
| `shop_point === true` | 店舗別タブを「準備中」で見せる（D章。1.3a では実装しない） |
| `shop_point === false` | 店舗別タブ自体を非表示 or disabled |

⚠️ **サーバ側ゲートとの整合**: GAS は商品別を**サーバ側でゲートしない**（`コード.js:376-377`「実行ゲートは UI レベル」）。つまり `features.item_point` の強制はフロント責務。フロントを迂回した直接 POST は通ってしまう点は仕様として許容（現 Phase の方針）。本書はその前提を明記するに留める。

### B-3. 出力先セレクタの導入 ★
- 「🎯 ポイント変倍設定」セクション（`index.html:648-694`）の冒頭に**出力先トグル（商品別 / 店舗別）**を新設。
- 既定は「商品別」。`features` により選択肢の活殺を制御（B-2）。
- **送信方式は action 分岐で確定 ★**（`outputTarget` フィールド方式は不採用）。
  - 商品別 → 現行 `action:'updatePointCampaignWithAuth'`
  - 店舗別 → `action:'updateShopPointCampaign'`（`コード.js:407` の既存スタブ）
  - 理由: GAS は既に `updateShopPointCampaign` を **action 分岐で実装済み**（`コード.js:407`）。`outputTarget` フィールド方式は GAS 改修を伴うため**不採用**。フロントは action を出し分けるだけでよい。

### B-4. 変倍率レンジの出力先連動 ★
- 商品別: `min=1`（1倍は店舗別キャンセル戦略）。
- 店舗別: `min=2`（RMS 仕様で 1 不可）。
- スライダー `index.html:655` の `min` を出力先選択に応じて動的変更。
- ⚠️ サーバ側は商品別の `pointRate` を 1〜20 で検証済み（`コード.js:382`）。店舗別の 2〜20 検証は**店舗別本実装（Phase 2）で GAS 側にも追加要**（現スタブは検証前に未実装応答を返す）。

### B-5. エラー文言コントラクトの構造化 ★（A-3 の解決）
- `result.error.includes('認証')` の文字列マッチを廃し、**エラー種別コード**で判定する設計へ。
  - 理想: GAS が `errorCode`（例 `AUTH_FAILED` / `NO_ENTITLEMENT` / `CONTRACT_EXPIRED` / `FEATURE_DISABLED`）を返す。
  - ☆ これは GAS 側コントラクト追加を伴うため、**GAS 変更を要するか／フロント側の文言リストで暫定対応するか**を 1.3b で判断。
  - 暫定案（GAS 非改修）: フロントに「認証ステータス領域へ出すべき文言リスト」を持ち、A-3 表の4文言を含める。
- ☆ 中期的には GAS レスポンス契約に `errorCode` を足すのが正。CLAUDE.md の「契約」節に追記する。

### B-6. `role` の扱い ☆
- `authenticateShop` は `role` を返す（`コード.js:219`）が、**現状アクション応答には含まれない**（`features` のみ返却）。
- 1.3a では `role` をフロントで使わない（E章＝GSD基盤Phaseへ委譲）。必要時に GAS 応答へ `role` を追加する委譲ポイントとしてのみ記録。

---

## 4. セクションC — 「個別設定しない」のフロント側フラグ両対応 ☆保留

- 楽天 items.patch では「個別設定しない（既存設定削除）」の API 実現可否が**未確定**（楽天サポート回答待ち。CLAUDE.md 記載、2026-05-24 時点 問い合わせ中）。
- **方針 ★**: 回答が来た時に**コード改修を最小化**できるよう、1.3a 設計時点で「両対応の器」を用意する。
  - 変倍率 UI に「個別設定しない」を**選択肢として差し込める構造**にしておく（例: スライダーとは別に「個別設定しない」チェック／ラジオを置ける領域を確保）。
  - フィーチャーフラグ **`ENABLE_CLEAR_SETTING`（フロント定数）** で**表示/非表示を一括切替**できるようにする。1.3a〜1.3c では**非表示（OFF）**が既定。
  - ★ **管理場所はフロント定数。`features` には載せない。** 理由: 楽天 API の「個別設定しない」機能可否は**店舗の契約・プランに依存しない**（楽天 API 共通仕様）。店舗ごとの利用権を表す `features` の責務とは分離する。
  - 送信ペイロード設計だけ先に決めておく（☆ 楽天回答により `pointCampaign:null` 送信 or 専用 action になる可能性）。実装はしない。
- ⚠️ 本機能は**設計の器のみ**。実ロジックは別タスク（楽天回答後）。

---

## 5. セクションD — 店舗別ポイント変倍の UI 入口 ★（1.3a は disabled 表示のみ）

- 出力先トグル（B-3）に「店舗別」を置くが、**1.3a/1.3c では機能を有効化しない**。
  - 表示: 「店舗別（Phase 2 提供予定）」のように **disabled + 注記**。
  - `features.shop_point === true` の店舗にも、当面は「準備中」を表示（GAS スタブが未実装応答 `コード.js:435-440` を返すため）。
- 店舗別を選んだ場合の RMS 優先順位（商品別優先）案内文（CLAUDE.md「優先順位」節）は、**UI 文言だけ先に用意**しておく（実機能は Phase 2）。
- 本実装（RMS 店舗別変倍画面の Python RPA 操作）は **Phase 2** に委譲。フロントは「入口の見た目」のみ。
- ⚠️ 変倍率 2〜20 強制（B-4）は Phase 2 で GAS/RPA 側にも実装が必要。

---

## 6. セクションE — GSD アカウント基盤連携の委譲ポイント（1.3a スコープ外・明示のみ）

ARCHITECTURE.md の Layer 0/1/2・`account_services`・`service_xxx` 連携のうち、**フロントが将来担う可能性がある部分**を「委譲ポイント」として列挙。**1.3a では実装しない**。

| 委譲ポイント | 内容 | 委譲先 |
|--------------|------|--------|
| 契約状態の表示 | `account_services.is_active` / `expires_at` をユーザーに可視化（「契約失効」等） | GSD基盤Phase |
| `role` ベースの UI 出し分け | admin/operator 等の権限による機能制御 | GSD基盤Phase（B-6 で応答に `role` 追加が前提） |
| 利用可能サービス一覧 | api_key/account_services 横断のサービス選択（マルチサービス基盤） | GSD基盤Phase |
| エラーコード契約 | `errorCode` 標準化（B-5）は GSD 全サービス共通契約として設計するのが望ましい | GSD基盤Phase と協調 |

→ 1.3a の成果物としては「**フロントは `features` 受領までを担い、契約・権限・サービス横断はGSD基盤Phaseへ委譲する**」という線引きを確定させることが目的。

---

## 7. セクションF — 実装フェーズ分割案 ☆要承認

| Phase | 内容 | 後方互換 | GAS 変更 | 完了条件 |
|-------|------|----------|----------|----------|
| **1.3b** | `features` 受領・保持（B-1）＋エラー文言コントラクト対応（B-5 暫定案＝GAS非改修）＋残骸クリーンアップ（A-4） | ✅ 完全互換 | なし | features を保持し、新4文言を認証ステータスに正しく表示 |
| **1.3c** | 出力先セレクタ導入（B-3）＋商品別ゲート（B-2）＋変倍率レンジ動的化（B-4 のフロント分）＋店舗別 disabled 入口（D） | ✅（店舗別は disabled） | なし（既存 action 利用） | 商品別/店舗別トグルが features 連動。店舗別は「準備中」 |
| **1.3d** | 「個別設定しない」両対応の器（C）を OFF 状態で実装 | ✅ | なし | フラグ ON で選択肢が出る構造（既定 OFF） |
| **（楽天回答後）** | 「個別設定しない」本実装 | — | 可能性あり | C 章の送信仕様確定後 |
| **Phase 2** | 店舗別本実装（RPA 連携）＋店舗別 2〜20 検証 | — | あり | 店舗別変倍が実際に反映 |
| **（GSD基盤Phase）** | E 章の委譲ポイント | — | あり（`role`/`errorCode`） | 別計画書 |

★ **推奨着手順**: 1.3b（最小・無リスク）→ 1.3c（UI拡張）→ 1.3d（器）。各段階で本番デプロイ整合（8章）を判断。

---

## 8. デプロイ整合（重要・前提条件） ⚠️

現状、**本番 WebApp は Phase 1.2 未反映**（version 8 固定、566行 旧コード）。フロント改修と GAS 反映のタイミングを誤ると不整合になる。

### 確認済みのデプロイ実態（2026-05-24）
- GAS プロジェクト HEAD = Phase 1.2（812行、ローカルと md5 一致）。
- デプロイは2つ:
  - `AKfycbxZQ99…` **@HEAD**（最新を配信。ただし本番URLではない）
  - `AKfycbwDk1Tx…` **@8「商品選択Ver」**（= **本番URL**。`index.html:723` がハードコード参照）← 旧コード固定
- → 本番に Phase 1.2 を出すには、**本番デプロイ `AKfycbwDk1Tx…` を新バージョンへ redeploy**（URL は不変）。

### 推奨タイミング ★
**本番 redeploy は「1.3c 完成時」に確定**。以下を同時実施:
1. `clasp push`（HEAD が既に Phase 1.2 のため実質 no-op。安全確認）
2. `clasp redeploy <本番 deploymentId: AKfycbwDk1Tx…/exec> -d "Phase 1.2/1.3"` で本番を新バージョンへ
3. スプレッドシートに `account_services` / `service_rpointup` シートを整備（fail-open → 正規運用へ）

**1.3b 完了時点では本番 redeploy は行わない。** 1.3b の検証は **GAS HEAD デプロイ（`AKfycbxZQ99…`）** 上で実施し、本番 URL（version 8 固定）は据え置く（→ 10章 検証方針）。本番反映は 1.3c 完成を待つ。

> 理由: Phase 1.2 は後方互換だが、フロント未消費のまま本番投入すると「出したが使われていない」状態になり、かつ fail-open のまま新認証経路を本番に晒すことになる。**フロント完成（1.3c）・シート整備・redeploy をワンセット**にするのが安全。1.3b の features 受領・エラー文言対応は本番を動かさず HEAD デプロイで検証できる（とみぃ判断 2026-05-24）。

---

## 9. 未決事項 / 確認待ち ☆

| # | 事項 | ブロッカー | 関連章 |
|---|------|-----------|--------|
| 1 | 「個別設定しない」の API 実現方式 | 楽天サポート回答待ち | C |
| 2 | エラー種別コード `errorCode` を GAS 契約に追加するか | 暫定はフロント文言リスト（1.3b）／中期は GSD 基盤Phase | B-5, E |
| 3 | `role` をアクション応答へ含めるか | GSD基盤Phase | B-6, E |
| 4 | 店舗別 変倍率 2〜20 の GAS/RPA 側検証 | Phase 2 | B-4, D |

> ※ 旧 #2「出力先の送信方式」は B-3 で **action 分岐に確定**したため削除。

---

## 10. 検証方針（手動テスト手順） ★

全フェーズ共通の検証環境と、フェーズ別の手動テスト手順。**本番 URL（version 8 固定）は使わず**、GAS HEAD デプロイで検証する（8章と整合）。

### 10-0. 共通テスト環境
- **フロント**: ローカルの `index.html` を直接ブラウザで開く（または GitHub Pages の検証用ブランチ）。
- **GAS エンドポイント**: 検証中は `GAS_WEB_APP_URL`（`index.html:723`）を **GAS HEAD デプロイ `AKfycbxZQ99…/exec`** に一時的に差し替える。
  - HEAD デプロイは常に最新コード（Phase 1.2〜）を配信するため、**本番（version 8）に影響を与えず**に検証できる。
  - ⚠️ 検証後は本番 URL（`AKfycbwDk1Tx…`）へ戻す。本番反映は 1.3c 完成時の redeploy で実施（8章）。
- **テスト店舗**: `api_key` シートの既存テスト店舗（例 `tokyoflower`）を使用。

### 10-0b. テスト用シートの用意（fail-open を一時的にオフにする手順）
新4文言を実機で発火させるには、Layer1/2 を「行あり」状態にして fail-open を抜ける必要がある（`コード.js:209` の fail-open は **行が無い**ときに通過する挙動）。

1. スプレッドシート（`SPREADSHEET_ID`）に **`account_services`** シートを作成。
   - ヘッダー: `id | service | is_active | role | granted_at | expires_at`
   - テスト行を投入して各文言を発火:

     | 検証したい文言 | id | service | is_active | expires_at |
     |----|----|----|----|----|
     | 「このサービスの利用権がありません」 | テスト店舗id | `rpointup` | `FALSE` | （空） |
     | 「ご契約が無効です。…」 | テスト店舗id | `rpointup` | `TRUE` | 過去日付 |
     | （正常通過） | テスト店舗id | `rpointup` | `TRUE` | 未来日付 or 空 |

2. **`service_rpointup`** シートを作成。
   - ヘッダー: `id | feature_item_point | feature_shop_point | rms_login_id | rms_login_pw`
   - 「プラン未許可（商品別）」検証: 当該 id 行で `feature_item_point=FALSE`
   - 「店舗別プラン許可」検証: `feature_shop_point=TRUE`（店舗別未実装文言の発火に使用）

3. ⚠️ **検証後はテスト行を削除**（または `is_active`/フラグを元に戻す）。**本番店舗の行は触らない。** 行を消せば再び fail-open（全通過 / features 全 false）に戻る。

### 10-1. 1.3b の検証（features 受領 + エラー文言コントラクト）
完了条件: `features` を保持し、**新4文言を「認証ステータス領域」に正しく表示**。
- [ ] 正常店舗で検索 → 認証成功表示。`authenticatedShop.features` に `{item_point, shop_point}` が保持される（DevTools で確認）。
- [ ] `account_services` `is_active=FALSE` → 「このサービスの利用権がありません」が**認証ステータス領域**（汎用エラーではなく）に表示。
- [ ] `expires_at` 過去日付 → 「ご契約が無効です。ご契約状況をご確認ください」が認証ステータス領域に表示。
- [ ] 店舗別アクションを叩く → 「この機能は現在のプランではご利用いただけません」（`shop_point≠true` 時）／「店舗別ポイント変倍は現在ご利用いただけません。お問い合わせください。」（スタブ未実装）が認証ステータス領域に表示。
- [ ] 上記4文言すべてが `error.includes('認証')` を脱した新ロジック（B-5）で正しく振り分けられること。
- [ ] 残骸（`submitFrame` 等 A-4）削除後も商品別の検索→設定が回帰なく動く。

### 10-2. 1.3c の検証（出力先セレクタ + ゲート + 変倍率レンジ）
完了条件: 商品別/店舗別トグルが `features` 連動。店舗別は「準備中」。
- [ ] `features.item_point=true` → 商品別 UI 有効。`false` → disabled + 案内表示。
- [ ] `features.shop_point=true` → 店舗別タブが「準備中（Phase2 提供予定）」で disabled 表示。`false` → 店舗別タブ非表示/disabled。
- [ ] 出力先=商品別で変倍率スライダー `min=1`、店舗別で `min=2` に切り替わる。
- [ ] 送信プレビューで、商品別が `action:'updatePointCampaignWithAuth'`、店舗別（仮有効化時）が `action:'updateShopPointCampaign'` を送ることを確認。
- [ ] 完了後 → **8章の手順で本番 redeploy** → `GAS_WEB_APP_URL` を本番 URL に戻し、本番でも回帰確認。

### 10-3. 1.3d の検証（「個別設定しない」の器・OFF）
完了条件: `ENABLE_CLEAR_SETTING`（フロント定数）で選択肢が出る構造（既定 OFF）。
- [ ] `ENABLE_CLEAR_SETTING=false`（既定）→ 「個別設定しない」UI は非表示。既存挙動に影響なし。
- [ ] `ENABLE_CLEAR_SETTING=true`（手動切替）→ 変倍率エリアに「個別設定しない」選択肢が出現（送信ロジックは未実装でよい＝器のみ確認）。
- [ ] フラグが `features` に依存しないこと（店舗を変えても出し分けが変わらない）を確認（C 章の責務分離）。

---

## 付録. 参照行サマリ（実体ソース基準）

- 変倍率スライダー: `index.html:655`（`min=1 max=20`）
- searchItems 送出/受領: `index.html:947-953` / `index.html:963-976`
- 商品形状描画: `index.html:1014-1031`
- submitData 送出/受領: `index.html:1303-1317` / `index.html:1340-1363`
- 認証文字列マッチ: `index.html:971`, `index.html:1359`
- GAS `features` 返却: `コード.js:349`（search）/ `コード.js:401`（update）
- GAS 商品別 非ゲート方針: `コード.js:376-377`
- GAS 商品別 pointRate 1〜20 検証: `コード.js:382`
- GAS 店舗別スタブ・gate: `コード.js:427-440`
- GAS fail-open（Layer1）: `コード.js:209`
- GAS features 構築: `コード.js:214-217`
- 新エラー文言: `コード.js:200, 205, 430, 438`
