# CLAUDE.md — ポイント変倍侍（Rpointup）

楽天の商品別ポイント変倍を一括設定するWebアプリ「ポイント変倍侍」のCLAUDE.md。
（旧称「商品別ポイント変倍設定」→ 店舗別ポイント変倍も含む統合サービスへ拡張するため改称）

## プロジェクト概要
- **本番URL**: https://pointup.ginzasugiden.com/
- **構成**: GitHub Pages（`index.html`）+ Google Apps Script（GAS WebApp / `コード.js`）+ Google Spreadsheet
- **GAS WebApp URL**: `https://script.google.com/macros/s/AKfycbwDk1TxHZL7lUtYmccXj5q5-YW_CI7W_x2QQp88NB6JDiD8cKC3-KJRUy2y3g_InBTdEw/exec`
- **GAS scriptId**: `1zMndANFbPRc3AjIh4GCLjHayfEALRZcL5puAOjOwa59CevPrOBkT4GKz`（`.clasp.json` に記録。機密ではない）
- **認証情報の管理**: スプレッドシート「コンテンツページ生成ちゃん」の `api_key` シートで複数店舗を管理。`serviceSecret` / `licenseKey` / `pw` は `BASE64:` プレフィックス付きで保存し、GAS側でデコード。
  - スプレッドシートIDは GAS のスクリプトプロパティ `SPREADSHEET_ID` で保持（コード内ハードコードではない）。
- **楽天API**: RMS Item API。`items/search`（商品検索）と `items/manage-numbers/{manageNumber}` の PATCH（`pointCampaign` 更新）。pointRate 1〜20、開始2h後〜60日、終了59分〜59日23h59m。

## ポイント変倍侍 固有仕様

### 出力先（択一仕様）★設計★
ユーザーは「商品別」「店舗別」のどちらか一方しか選べない（同時設定不可）。

| 出力先 | 対象 | 実装方法 | 状態 |
|--------|------|----------|------|
| 商品別 | 指定した商品（複数選択可） | 楽天 items.patch API（pointCampaign） | ★実装済 |
| 店舗別 | 店舗の全商品 | RMSの店舗別変倍設定画面を Python RPA で操作 | ☆未実装（Phase 2） |

### 変倍率の範囲（出力先で異なる）★設計★

| 出力先 | 変倍率 | 刻み | 補足 |
|--------|--------|------|------|
| 商品別 | 1〜20倍 | 1倍刻み | 1倍は店舗別変倍をキャンセルする戦略的用途あり |
| 店舗別 | 2〜20倍 | 1倍刻み | 1倍は選択不可（RMS仕様） |

実装上の注意:
- 出力先が店舗別の場合、変倍率1を選択させてはならない（RMS側でエラー）
- フロントとGASの両方でバリデーションする

### 期間設定の制約（両出力先で共通）★API仕様★

楽天 items.patch ドキュメント（pointCampaign）より:
- 開始日時: 現在時刻の最短2時間後〜最長60日後、時単位（:00:00自動補正）
- 終了日時: 開始日時から最短59分59秒〜最長59日23時間59分59秒後、時単位（:59:59自動補正）
- 無期限の場合: 終了日時に `9999-12-31T23:59:59+09:00` を指定
- 例: 現在 01:12 → 最短開始は 04:00（02:12+2h=03:12 → 切り上げて 04:00）

### ポイント設定の優先順位（楽天RMS側の仕様）★RMS仕様★

同じ商品に商品別と店舗別の両方が設定されている場合、**商品別が優先される**。

| 店舗別変倍率 | 商品別変倍率 | 最終的に適用される変倍率 |
|--------------|--------------|--------------------------|
| 5倍 | 1倍 | **1倍**（商品別優先、店舗別キャンセル戦略） |
| 5倍 | 2倍 | 2倍（商品別優先） |
| 5倍 | 10倍 | 10倍（商品別優先） |
| 5倍 | 設定なし | 5倍（店舗別が適用） |
| 設定なし | 10倍 | 10倍（商品別） |

このルールはツール側で制御するものではなく楽天RMSの仕様。
店舗別を選択時、UI上でユーザーに案内する。

### 「個別設定しない」機能（保留・将来課題）☆保留☆

楽天RMS管理画面では、商品別ポイント変倍の選択肢として「個別設定しない」
（既存設定の削除）が存在する。これを API 経由で実現する方法は、
items.patch のドキュメントには明示されていない。

- `pointCampaign: null` の送信で削除されるか不明
- 楽天サポートに問い合わせ中（2026-05-24 時点）
- Phase 1 では実装せず、サポート回答後に別タスクで実装する

## リポジトリ構成
- `index.html` — フロントエンド全部（HTML/CSS/JS一体型、約1384行）
- `コード.js` — **GAS本体（812行。Phase 1.2 で Layer 0/1/2 認証認可・`features`・店舗別スタブを追加し +246行）。clasp clone で取得しリポジトリ管理下**。
  - ⚠️ ファイル名は日本語ロケールのデフォルト名 `コード.js`（`Code.js` ではない）。リネームは次回 push 時に GAS側ファイル名も変わるため当面そのまま。
- `appsscript.json` — GASマニフェスト（clasp管理）
- `.clasp.json` — GASプロジェクトリンク（scriptId）。git管理対象（機密ではない）
- `.gitignore` — `node_modules/`, `Thumbs.db`, `.DS_Store`, `.vscode/`, `.clasprc.json`
- `CNAME` — `pointup.ginzasugiden.com`（GitHub Pages カスタムドメイン）

## index.html の構造
| 区分 | 行範囲 | 概要 |
|------|--------|------|
| HTML `<head>` | 1–7 | meta / title「ポイント変倍侍」 |
| CSS `<style>` | 7–564（約556行） | 全スタイル。テーマ色 `#bf0000`（楽天レッド）。レスポンシブ（`max-width:600px`） |
| HTML `<body>` | 566–718（約153行） | 下記セクション参照 |
| JS `<script>` | 719–1382（約663行） | 全ロジック |

おおよその割合: **CSS 約40% / JS 約48% / HTML構造 約12%**。

### 主要HTMLセクション（見出し）
- `🏪 ポイント変倍侍`（ヘッダー h1, 569）
- `🔐 店舗認証`（店舗ID/パスワード, 575–590）
- `📦 対象商品`（593）
  - `🔍 商品検索`（597–621）／検索結果リスト・ページネーション
  - `📋 選択済み商品`（624–634）
  - `📝 商品管理番号を直接入力`（手動入力 details, 637–645）
- `🎯 ポイント変倍設定`（648–694）／変倍率スライダー・開始/終了日時・無期限チェック
- `📋 送信データプレビュー`（preview JSON, 697–700）
- ステータス表示・結果詳細（702–704）
- ボタン: リセット / `🚀 ポイント変倍を設定`（707–712）

## index.html JavaScript 機能ブロック

### グローバル状態
- `GAS_WEB_APP_URL`（**723行・ハードコード**）
- `shops`（726, 未使用に近い）／`authenticatedShop`（727）／`selectedItems`（Map, 728）／`searchCursorMark`（729）

### 認証フロー（ID/PW検証）
- 専用ログインボタンは無し。認証はサーバ側（GAS `authenticateShop`）で暗黙的に行われる。
- `checkAuthInputs()`（817）: 店舗ID・PW両方入力で検索を有効化。
- 成否判定は GASレスポンス依存: `result.shopName`（成功）/ `result.error.includes('認証')`（失敗）。表示は `showAuthStatus()`（905）。

### 商品検索（楽天 items/search 連携）
- `searchItems(cursorMark)`（934）: GASへ `action:'searchItems'` をPOST。初回検索が実質の認証も兼ねる。
- `displaySearchResults()`（996）: 結果描画＋ `cursorMark` ページネーション（次の30件）。

### ポイント変倍設定（GAS POST）
- `submitData()`（1266）: `action:'updatePointCampaignWithAuth'` をPOST。
- ペイロード: `shopId`, `password`, `manageNumbers[]`, `pointCampaign.applicablePeriod.{start,end}`, `pointCampaign.benefits.pointRate`。
- 結果表示: `showResultsDetail()`（1373）。

### 日時バリデーション（xx:00:00 / xx:59:59 / 開始<終了）
- 時刻は「日付 + 時(0〜23セレクト)」入力（`initHourSelects` 746）。
- 開始は常に `:00:00` 固定（`formatStartToISO8601JST` 889）、終了は常に `:59:59` 固定（`formatEndToISO8601JST` 897）。出力は `+09:00`（JST）付きISO8601。
- 既定値: 開始=現在+3h、終了=開始+1h（`setDefaultDateTime` 766）。
- start<end チェック: `validateEndDateTime`（863）/ 自動補正 `validateAndAdjustEndDateTime`（846）。
- 無期限時は終了 = `"9999-12-31T23:59:59+09:00"`。
- **注意**: 「2h後〜60日」「59分〜59日」の範囲はヒント文（670/680行）のみで、クライアント側に明示的enforceは無い（実制約は楽天API側）。

### GASとの通信
- `fetch(POST)`、`Content-Type:'text/plain'`（**CORSプリフライト回避**目的）、`submitData` は `redirect:'follow'`。`response.json()` で受信。`no-cors` 不使用。

### 既知の未使用/残骸コード（変更前に要確認）
- `<iframe id="submitFrame">`（717）: 宣言のみで未参照。
- `formatDateTimeLocal()`（1147）/ `formatToISO8601JST()`（1157）: 定義のみで呼び出し無し。
- `shops` 変数（726）: 実質未使用。

## コード.js（GAS本体）サマリ

- **全体行数**: 812行（Phase 1.2 で Layer 0/1/2 認証認可・`features`・店舗別スタブを追加し +246行）
- **マルチテナント対応版（CORS対応）**。フロントの `action` に応じてJSONを返す。
- **Phase 1.2 追加**: `SERVICE_ID='rpointup'`（L11）。Layer 1=`account_services`（利用権）/ Layer 2=`service_rpointup`（機能フラグ）を参照し、認証成功時に `features:{item_point, shop_point}` を返す。**シート未整備時は fail-open**（既存ユーザー保護。`コード.js:209`）。

### 関数一覧と役割（★=Phase 1.2 追加/改修）
| 関数 | 行 | 役割 |
|------|----|------|
| `toBool(v)` ★ | 17 | 文字列/真偽の正規化（TRUE/true/1 等 → boolean） |
| `getSpreadsheetId()` | 24 | スクリプトプロパティ `SPREADSHEET_ID` を取得（未設定なら例外） |
| `getShopsData()` | 33 | `api_key` シート全行を読み、店舗配列を返す（列: id, licenseKey, serviceSecret, pw, sid, sname, email） |
| `getShopCredentials(shopId)` | 72 | shopId で店舗検索しAPI認証情報を返す（後方互換用、PW検証なし） |
| `getAccountServices(id, service)` ★ | 92 | Layer 1: `account_services` から利用権 `{is_active, role, granted_at, expires_at}`。シート/行なしは null（fail-open 判断は呼出側） |
| `getServiceRpointup(id)` ★ | 127 | Layer 2: `service_rpointup` から機能フラグ・固有設定。`rms_login_id/pw` は内部専用で features・応答に**含めない** |
| `authenticateShop(shopId, password)` ★ | 159 | Layer 0(ID+PW)→1(利用権)→2(機能フラグ)。`{success, shop, features, role}`。pw は BASE64 デコード照合。Layer1 は fail-open |
| `getAuthHeader(shop)` | 222 | serviceSecret/licenseKey をデコード→`ESA base64(secret:license)` 認証ヘッダー生成 |
| `doGet(e)` | 245 | GETエントリ → `processGet` |
| `doPost(e)` | 253 | POSTエントリ → `processPost` |
| `processGet(e)` | 261 | `getShops` で安全な店舗一覧。`callback` でJSONP対応 |
| `processPost(e)` ★ | 316 | `action` 分岐（searchItems / updatePointCampaignWithAuth / **updateShopPointCampaign** / updatePointCampaign） |
| `searchItems(shop, keyword, cursorMark)` | 484 | 楽天 items/search を呼び商品整形（hits=30, cursorMarkページネーション） |
| `updatePointCampaignBatch(shop, manageNumbers, pointCampaign)` | 560 | 商品ごとに更新、各呼び出し間 500ms sleep、結果配列を返す |
| `updatePointCampaign(shop, manageNumber, pointCampaign)` | 586 | items PATCH で `pointCampaign` 更新（204成功） |
| `getItem(shop, manageNumber)` | 627 | items GET（単品取得ユーティリティ。現状未使用） |
| `logResults(shopId, results)` | 653 | 処理結果をconsoleログ出力 |
| `testGetShops()` | 672 | テスト: 店舗数/一覧ログ |
| `testAuth()` | 684 | テスト: 認証ヘッダー生成確認（testShopId='tokyoflower'） |
| `testPasswordAuth()` | 701 | テスト: pw のBASE64デコード&認証確認（テストPWハードコードあり） |
| `testAccountServices()` ★ | 738 | テスト: Layer 1（account_services）読み取り |
| `testServiceRpointup()` ★ | 749 | テスト: Layer 2（service_rpointup）読み取り |
| `testAuthenticationWithFeatures()` ★ | 765 | テスト: 拡張 authenticateShop（Layer0/1/2 + features） |
| `testToBool()` ★ | 783 | テスト: toBool 正規化 |
| `testBackwardCompat()` ★ | 801 | テスト: 行なし時 fail-open / features 全false の後方互換 |

### BASE64デコード処理の場所
- `authenticateShop` L172–174 … pw列（`BASE64:` プレフィックス）をデコードして照合
- `getAuthHeader`（L222〜）… serviceSecret / licenseKey をデコード→`Utilities.base64Encode(secret + ':' + license)` で再エンコード（認証ヘッダー生成）
- `testPasswordAuth`（L701〜）… テスト用デコード
- 共通実装: `Utilities.newBlob(Utilities.base64Decode(値.replace('BASE64:', ''))).getDataAsString()`

### 楽天API連携部分
- **認証ヘッダー**: `Authorization: ESA {base64(serviceSecret:licenseKey)}`（RMS Item API）
- **商品検索**: `searchItems` → `GET https://api.rms.rakuten.co.jp/es/2.0/items/search`（L484〜）。`title=`（キーワード）, `cursorMark=`, `hits=30`。200で `results[].item` を `{manageNumber, title, price, itemType}` に整形、`numFound`→totalCount、`nextCursorMark` を返す。価格は最初のvariantの `standardPrice`。
- **ポイント変倍更新**: `updatePointCampaign` → `PATCH https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/{manageNumber}`（L586〜）。payload `{ pointCampaign }`、`Content-Type: application/json`。204で成功。
- **単品取得**: `getItem` → 同 manage-numbers エンドポイントの GET（L627、未使用）。
- 全呼び出し `muteHttpExceptions: true`。エラー時はステータスコード付きで例外送出。

### エンドポイント別の挙動（action ごと）
**GET（`processGet`）**
- `getShops` → `{success, shops:[{id, sid, sname, email}]}`（認証情報は返さない）
- 指定なし/その他 → `{success, message:'ポイント変倍侍 API（マルチテナント対応版）', availableActions:['getShops']}`
- `callback` パラメータあり → JSONP で返す

**POST（`processPost`）** デフォルト action = `updatePointCampaign`
- `searchItems` → shopId/password 必須 → `authenticateShop` → `searchItems` → `{success, shopName, features, items, totalCount, nextCursorMark}`（★`features` 追加）
- `updatePointCampaignWithAuth` → shopId/password 必須 → `authenticateShop` → `updatePointCampaignBatch` → `logResults` → `{success, shopId, shopName, features, results}`（★`features` 追加。**商品別はサーバ側ゲートなし**＝実行ゲートは UI 側。pointRate を 1〜20 で検証）
- `updateShopPointCampaign`（★Phase 1.2 追加・店舗別スタブ） → shopId/password 必須 → `authenticateShop` → `features.shop_point===true` 必須 → **未実装応答を返す**（本実装は Phase 2 / Python RPA）
- `updatePointCampaign`（認証なし・後方互換） → shopId 必須（PW不要）→ `getShopCredentials` → `updatePointCampaignBatch` → `{success, shopId, results}`
- 不明な action → `{success:false, error:'不明なアクション: ...'}`

※ 現フロントが使うのは `searchItems` と `updatePointCampaignWithAuth` の2つ（`features` は返るが**現フロントは未消費**。消費設計は `docs/PHASE_1_3a_FRONTEND_PLAN.md` 参照）。

## GAS同期コマンド（clasp）
- `clasp pull` … GAS本体の最新を取得（`コード.js` / `appsscript.json` を上書き）
- `clasp push` … ローカルの変更をGASへ反映（**要注意: 本番GASを上書き。実行前に確認**）
- `clasp deploy` … 新しいデプロイ（WebApp公開バージョン）を作成
- `clasp version` … バージョンを記録（スナップショット作成）
- 認証: `clasp login`（対話型・ブラウザ。グローバル `~/.clasprc.json` に保存）

> 運用ルール: 当面 `clasp push` / `clasp deploy` は人手の確認後に実行。読み取り（`clasp pull`）は随時可。

## 今後の拡張予定
- **店舗別ポイント変倍機能**（仕様確定待ち） … 商品単位だけでなく店舗全体への変倍設定
- **マルチアカウント化**（仕様確定待ち） … 複数アカウント/権限管理の拡張

## 作業上の注意
- フロント変更は `index.html` 1ファイル。デプロイは GitHub Pages（mainへpushで反映）。カスタムドメインは `CNAME`。
- GASロジックは `コード.js`（リポジトリ管理下）。GASへの反映は `clasp push`（要確認）。スプレッドシート/楽天API/BASE64デコードはここに実装。
- GASレスポンス構造（`success`, `shopName`, `error`, `items`, `totalCount`, `nextCursorMark`, `results[]`, ★`features:{item_point, shop_point}`）がフロントとの契約。`features` は Phase 1.2 で追加（助言情報。現フロント未消費）。
