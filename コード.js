/**
 * ポイント変倍侍 GASスクリプト（マルチテナント対応版）
 * CORS対応版
 */

// ====================================
// 設定
// ====================================

// Phase 1.2: このサービスの識別子（account_services.service と一致させる）
const SERVICE_ID = 'rpointup';

/**
 * Phase 1.2: チェックボックス/文字列どちらのブール表現にも対応するヘルパー
 * Google Sheets のチェックボックス列は真偽値を返すが、テキスト 'TRUE'/'FALSE' の場合もあるため両対応。
 */
function toBool(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return v.trim().toUpperCase() === 'TRUE';
  return false; // 空欄・null・想定外 → false（安全側）
}

function getSpreadsheetId() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_IDが設定されていません。スクリプトプロパティを確認してください。');
  }
  return id;
}

function getShopsData() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('api_key');
  
  if (!sheet) {
    throw new Error('api_keyシートが見つかりません');
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const idIdx = headers.indexOf('id');
  const licenseKeyIdx = headers.indexOf('licenseKey');
  const serviceSecretIdx = headers.indexOf('serviceSecret');
  const pwIdx = headers.indexOf('pw');
  const sidIdx = headers.indexOf('sid');
  const snameIdx = headers.indexOf('sname');
  const emailIdx = headers.indexOf('email');
  
  const shops = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[idIdx]) {
      shops.push({
        id: row[idIdx],
        licenseKey: row[licenseKeyIdx],
        serviceSecret: row[serviceSecretIdx],
        pw: row[pwIdx],
        sid: row[sidIdx],
        sname: row[snameIdx],
        email: row[emailIdx]
      });
    }
  }
  
  return shops;
}

function getShopCredentials(shopId) {
  const shops = getShopsData();
  const shop = shops.find(s => s.id === shopId);
  
  if (!shop) {
    throw new Error(`店舗が見つかりません: ${shopId}`);
  }
  
  if (!shop.serviceSecret || !shop.licenseKey) {
    throw new Error(`店舗 ${shopId} のAPI認証情報が設定されていません`);
  }
  
  return shop;
}

/**
 * Phase 1.2: Layer 1 — account_services から当該アカウントの利用権を取得
 * 戻り値: { is_active, role, granted_at, expires_at } または null（シート未作成 / 一致行なし）
 * 読み取りは getShopsData と同じ indexOf 方式（列順非依存）。
 */
function getAccountServices(id, service) {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('account_services');
  if (!sheet) return null; // シート未作成 → null（呼び出し側で fail-open 判断）

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const headers = data[0];
  const idIdx = headers.indexOf('id');
  const serviceIdx = headers.indexOf('service');
  const isActiveIdx = headers.indexOf('is_active');
  const roleIdx = headers.indexOf('role');
  const grantedIdx = headers.indexOf('granted_at');
  const expiresIdx = headers.indexOf('expires_at');

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[idIdx]) === String(id) && String(row[serviceIdx]) === String(service)) {
      return {
        is_active: toBool(row[isActiveIdx]),
        role: row[roleIdx] || null,
        granted_at: row[grantedIdx] || null,
        expires_at: row[expiresIdx] || null
      };
    }
  }
  return null; // 一致行なし
}

/**
 * Phase 1.2: Layer 2 — service_rpointup から機能フラグ・固有設定を取得
 * 戻り値: { feature_item_point, feature_shop_point, rms_login_id, rms_login_pw } または null（シート未作成 / 行なし）
 * 注意: rms_login_id / rms_login_pw は内部利用専用。features にもレスポンスにも絶対に含めない。
 */
function getServiceRpointup(id) {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('service_rpointup');
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const headers = data[0];
  const idIdx = headers.indexOf('id');
  const itemIdx = headers.indexOf('feature_item_point');
  const shopIdx = headers.indexOf('feature_shop_point');
  const loginIdIdx = headers.indexOf('rms_login_id');
  const loginPwIdx = headers.indexOf('rms_login_pw');

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[idIdx]) === String(id)) {
      return {
        feature_item_point: toBool(row[itemIdx]),
        feature_shop_point: toBool(row[shopIdx]),
        rms_login_id: row[loginIdIdx] || '',
        rms_login_pw: row[loginPwIdx] || ''
      };
    }
  }
  return null; // 行なし → 呼び出し側で全機能 FALSE 扱い（安全側）
}

/**
 * 店舗認証（ID + パスワード）
 */
function authenticateShop(shopId, password) {
  const shops = getShopsData();
  const shop = shops.find(s => s.id === shopId);
  
  if (!shop) {
    // Phase 1.2: id 不一致でも pw 不一致と同一文言に統一（どちらが誤りか漏らさない）
    return { success: false, error: '認証に失敗しました。IDまたはパスワードが正しくありません' };
  }
  
  // パスワード検証（pw列）- BASE64デコードに対応
  let shopPw = String(shop.pw || '');
  
  // BASE64:プレフィックスがある場合はデコード
  if (shopPw.startsWith('BASE64:')) {
    try {
      shopPw = Utilities.newBlob(Utilities.base64Decode(shopPw.replace('BASE64:', ''))).getDataAsString();
    } catch (e) {
      console.error('パスワードのデコードに失敗:', e);
    }
  }
  
  const inputPw = String(password || '');
  
  console.log('認証試行 - shopId:', shopId);
  console.log('shopPw長さ:', shopPw.length, '入力pw長さ:', inputPw.length);
  
  if (!shopPw || shopPw !== inputPw) {
    return { success: false, error: '認証に失敗しました。IDまたはパスワードが正しくありません' };
  }
  
  if (!shop.serviceSecret || !shop.licenseKey) {
    return { success: false, error: 'API認証情報が設定されていません' };
  }

  // Phase 1.2 保留: flag / expiry / payment_status のチェックは入れない。
  // 特に expiry は楽天APIキー有効期限であり、ログインゲートにするのは誤り。

  // Phase 1.2: Layer 1 — account_services で利用権を確認
  const access = getAccountServices(shopId, SERVICE_ID);
  if (access) {
    if (access.is_active !== true) {
      return { success: false, error: 'このサービスの利用権がありません' };
    }
    if (access.expires_at) {
      const exp = (access.expires_at instanceof Date) ? access.expires_at : new Date(access.expires_at);
      if (!isNaN(exp.getTime()) && exp < new Date()) {
        return { success: false, error: 'ご契約が無効です。ご契約状況をご確認ください' };
      }
    }
  }
  // Phase 1.2: fail-open（既存ユーザー保護）。
  // account_services 整備後、fail-closed へ移行する想定（access == null は通過）

  // Phase 1.2: Layer 2 — service_rpointup から機能フラグを取得し features を構築
  const svc = getServiceRpointup(shopId);
  const features = {
    item_point: svc ? svc.feature_item_point : false, // 行なし → false（安全側）
    shop_point: svc ? svc.feature_shop_point : false
  };

  return { success: true, shop: shop, features: features, role: access ? access.role : null };
}

function getAuthHeader(shop) {
  // BASE64プレフィックスがある場合はデコード
  let serviceSecret = shop.serviceSecret;
  let licenseKey = shop.licenseKey;
  
  if (serviceSecret && serviceSecret.startsWith('BASE64:')) {
    serviceSecret = Utilities.newBlob(Utilities.base64Decode(serviceSecret.replace('BASE64:', ''))).getDataAsString();
  }
  if (licenseKey && licenseKey.startsWith('BASE64:')) {
    licenseKey = Utilities.newBlob(Utilities.base64Decode(licenseKey.replace('BASE64:', ''))).getDataAsString();
  }
  
  const encoded = Utilities.base64Encode(serviceSecret + ':' + licenseKey);
  return 'ESA ' + encoded;
}

// ====================================
// Web API（CORS対応）
// ====================================

/**
 * GETリクエスト
 */
function doGet(e) {
  const output = processGet(e);
  return output;
}

/**
 * POSTリクエスト
 */
function doPost(e) {
  const output = processPost(e);
  return output;
}

/**
 * GET処理
 */
function processGet(e) {
  try {
    const action = e.parameter.action;
    const callback = e.parameter.callback; // JSONP用
    
    let responseData;
    
    if (action === 'getShops') {
      const shops = getShopsData();
      const safeShops = shops.map(s => ({
        id: s.id,
        sid: s.sid,
        sname: s.sname,
        email: s.email
      }));
      
      responseData = {
        success: true,
        shops: safeShops
      };
    } else {
      responseData = {
        success: true,
        message: 'ポイント変倍侍 API（マルチテナント対応版）',
        availableActions: ['getShops']
      };
    }
    
    // JSONP対応（callbackパラメータがある場合）
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(responseData) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('doGet エラー:', error);
    const errorData = { success: false, error: error.message };
    
    const callback = e.parameter.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(errorData) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService.createTextOutput(JSON.stringify(errorData))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POST処理
 */
function processPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    console.log('受信データ:', JSON.stringify(requestData, null, 2));
    
    const action = requestData.action || 'updatePointCampaign';
    
    // 商品検索
    if (action === 'searchItems') {
      if (!requestData.shopId) {
        throw new Error('店舗IDが指定されていません');
      }
      if (!requestData.password) {
        throw new Error('パスワードが指定されていません');
      }
      
      // 認証
      const authResult = authenticateShop(requestData.shopId, requestData.password);
      if (!authResult.success) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: authResult.error
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const shop = authResult.shop;
      
      // 商品検索実行
      const searchResult = searchItems(shop, requestData.keyword, requestData.cursorMark);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        shopName: shop.sname,
        features: authResult.features, // Phase 1.2: 機能フラグ（助言情報。既存項目は不変）
        items: searchResult.items,
        totalCount: searchResult.totalCount,
        nextCursorMark: searchResult.nextCursorMark
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 認証付きポイント変倍設定
    if (action === 'updatePointCampaignWithAuth') {
      if (!requestData.shopId) {
        throw new Error('店舗IDが指定されていません');
      }
      if (!requestData.password) {
        throw new Error('パスワードが指定されていません');
      }
      
      // 認証
      const authResult = authenticateShop(requestData.shopId, requestData.password);
      if (!authResult.success) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: authResult.error
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const shop = authResult.shop;

      // Phase 1.2: feature_item_point は助言情報として返却（実行ゲートは UI レベル＝フロントで実施）。
      //            商品別は従来どおり実行する（後方互換を完全維持）。

      // Phase 1.2: 商品別の変倍率を 1〜20 に制限（フロントと二重でバリデーション）
      const benefits = (requestData.pointCampaign && requestData.pointCampaign.benefits) || {};
      const pointRate = Number(benefits.pointRate);
      if (!(pointRate >= 1 && pointRate <= 20)) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: '変倍率は1〜20の範囲で指定してください'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      const results = updatePointCampaignBatch(
        shop,
        requestData.manageNumbers,
        requestData.pointCampaign
      );

      logResults(requestData.shopId, results);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        shopId: requestData.shopId,
        shopName: shop.sname,
        features: authResult.features, // Phase 1.2: 機能フラグ（助言情報。既存項目は不変）
        results: results
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Phase 1.2: 店舗別ポイント変倍（暫定スタブ。本実装は Phase 2 / Python RPA 連携）
    if (action === 'updateShopPointCampaign') {
      if (!requestData.shopId) {
        throw new Error('店舗IDが指定されていません');
      }
      if (!requestData.password) {
        throw new Error('パスワードが指定されていません');
      }

      // 認証（Layer 0/1/2）
      const authResult = authenticateShop(requestData.shopId, requestData.password);
      if (!authResult.success) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: authResult.error
        })).setMimeType(ContentService.MimeType.JSON);
      }

      const features = authResult.features;

      // Phase 1.2: 機能フラグ確認（feature_shop_point=TRUE が必須）
      if (!features || features.shop_point !== true) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'この機能は現在のプランではご利用いただけません',
          features: features
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // Phase 1.2: 店舗別は未実装。Phase 2 で Python RPA による本実装を行う。
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: '店舗別ポイント変倍は現在ご利用いただけません。お問い合わせください。',
        features: features
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 従来のポイント変倍設定（認証なし）- 後方互換性のため残す
    if (action === 'updatePointCampaign') {
      if (!requestData.shopId) {
        throw new Error('shopIdが指定されていません');
      }
      
      const shop = getShopCredentials(requestData.shopId);
      
      const results = updatePointCampaignBatch(
        shop,
        requestData.manageNumbers,
        requestData.pointCampaign
      );
      
      logResults(requestData.shopId, results);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        shopId: requestData.shopId,
        results: results
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    throw new Error(`不明なアクション: ${action}`);
    
  } catch (error) {
    console.error('doPost エラー:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ====================================
// 楽天API連携
// ====================================

/**
 * 商品検索
 */
function searchItems(shop, keyword, cursorMark) {
  let url = 'https://api.rms.rakuten.co.jp/es/2.0/items/search?';
  
  const params = [];
  
  // キーワード検索
  if (keyword && keyword.trim()) {
    params.push('title=' + encodeURIComponent(keyword.trim()));
  }
  
  // ページネーション
  if (cursorMark) {
    params.push('cursorMark=' + encodeURIComponent(cursorMark));
  }
  
  // 取得件数（最大30）
  params.push('hits=30');
  
  url += params.join('&');
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': getAuthHeader(shop)
    },
    muteHttpExceptions: true
  };
  
  console.log('商品検索URL:', url);
  
  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  console.log('検索レスポンスコード:', statusCode);
  
  if (statusCode === 200) {
    const data = JSON.parse(responseText);
    
    // 商品情報を整形
    const items = (data.results || []).map(result => {
      const item = result.item || {};
      const variants = item.variants || {};
      
      // 最初のバリアントから価格を取得
      let price = '';
      const variantKeys = Object.keys(variants);
      if (variantKeys.length > 0) {
        const firstVariant = variants[variantKeys[0]];
        price = firstVariant.standardPrice || '';
      }
      
      return {
        manageNumber: item.manageNumber,
        title: item.title || '',
        price: price,
        itemType: item.itemType || ''
      };
    });
    
    return {
      items: items,
      totalCount: data.numFound || items.length,
      nextCursorMark: data.nextCursorMark || null
    };
  } else {
    let errorData;
    try {
      errorData = JSON.parse(responseText);
    } catch {
      errorData = { raw: responseText };
    }
    throw new Error(`検索エラー (${statusCode}): ${JSON.stringify(errorData)}`);
  }
}

function updatePointCampaignBatch(shop, manageNumbers, pointCampaign) {
  const results = [];
  
  for (const manageNumber of manageNumbers) {
    try {
      const result = updatePointCampaign(shop, manageNumber, pointCampaign);
      results.push({
        manageNumber: manageNumber,
        success: true,
        result: result
      });
      
      Utilities.sleep(500);
      
    } catch (error) {
      results.push({
        manageNumber: manageNumber,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

function updatePointCampaign(shop, manageNumber, pointCampaign) {
  const url = `https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/${encodeURIComponent(manageNumber)}`;
  
  const payload = {
    pointCampaign: pointCampaign
  };
  
  const options = {
    method: 'patch',
    headers: {
      'Authorization': getAuthHeader(shop),
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  console.log(`API呼び出し [${shop.sname || shop.id}]: ${manageNumber}`);
  console.log('リクエスト:', JSON.stringify(payload, null, 2));
  
  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  console.log(`ステータス: ${statusCode}`);
  
  if (statusCode === 204) {
    return { status: 'success', code: 204 };
  } else if (statusCode >= 200 && statusCode < 300) {
    return JSON.parse(responseText);
  } else {
    let errorData;
    try {
      errorData = JSON.parse(responseText);
    } catch {
      errorData = { raw: responseText };
    }
    throw new Error(`API Error (${statusCode}): ${JSON.stringify(errorData)}`);
  }
}

function getItem(shop, manageNumber) {
  const url = `https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/${encodeURIComponent(manageNumber)}`;
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': getAuthHeader(shop)
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  if (statusCode === 200) {
    return JSON.parse(responseText);
  } else {
    throw new Error(`API Error (${statusCode}): ${responseText}`);
  }
}

// ====================================
// ユーティリティ
// ====================================

function logResults(shopId, results) {
  console.log('=== 処理結果 ===');
  console.log(`店舗: ${shopId}`);
  console.log(`成功: ${results.filter(r => r.success).length}件`);
  console.log(`失敗: ${results.filter(r => !r.success).length}件`);
  
  results.forEach(r => {
    if (r.success) {
      console.log(`✅ ${r.manageNumber}: 成功`);
    } else {
      console.log(`❌ ${r.manageNumber}: ${r.error}`);
    }
  });
}

// ====================================
// テスト用関数
// ====================================

function testGetShops() {
  try {
    const shops = getShopsData();
    console.log('店舗数:', shops.length);
    shops.forEach(s => {
      console.log(`- ${s.id}: ${s.sname} (認証情報: ${s.serviceSecret ? 'あり' : 'なし'})`);
    });
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

function testAuth() {
  const testShopId = 'tokyoflower';
  
  try {
    const shop = getShopCredentials(testShopId);
    const header = getAuthHeader(shop);
    console.log('店舗:', shop.sname);
    console.log('認証ヘッダー生成: OK');
    console.log('ヘッダー (先頭20文字):', header.substring(0, 20) + '...');
  } catch (error) {
    console.error('認証エラー:', error.message);
  }
}

/**
 * パスワード認証テスト
 */
function testPasswordAuth() {
  const testShopId = 'tokyoflower';
  const testPassword = 'lsMlu96Uqanq'; // デコード後の値を入力してテスト
  
  try {
    // まずpw列の値を確認
    const shops = getShopsData();
    const shop = shops.find(s => s.id === testShopId);
    console.log('pw列の値:', shop.pw);
    
    // BASE64デコードを試す
    let decodedPw = shop.pw;
    if (shop.pw && shop.pw.startsWith('BASE64:')) {
      decodedPw = Utilities.newBlob(Utilities.base64Decode(shop.pw.replace('BASE64:', ''))).getDataAsString();
      console.log('デコード後のpw:', decodedPw);
    }
    
    // 認証テスト
    const result = authenticateShop(testShopId, testPassword);
    console.log('認証結果:', result.success ? '成功' : '失敗');
    if (!result.success) {
      console.log('エラー:', result.error);
    } else {
      console.log('店舗名:', result.shop.sname);
    }
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

// ====================================
// Phase 1.2 テスト用関数
// ====================================

/**
 * Phase 1.2 テスト: account_services 読み取り（Layer 1）
 */
function testAccountServices() {
  console.log('--- testAccountServices ---');
  const found = getAccountServices('tokyoflower', SERVICE_ID);
  console.log('tokyoflower/' + SERVICE_ID + ':', JSON.stringify(found)); // {is_active, role, granted_at, expires_at} 期待
  const none = getAccountServices('___notexist___', SERVICE_ID);
  console.log('存在しないid:', none, none === null ? 'OK(null)' : 'NG'); // null 期待
}

/**
 * Phase 1.2 テスト: service_rpointup 読み取り（Layer 2）
 */
function testServiceRpointup() {
  console.log('--- testServiceRpointup ---');
  const svc = getServiceRpointup('tokyoflower');
  console.log('tokyoflower:', JSON.stringify({
    feature_item_point: svc ? svc.feature_item_point : null,
    feature_shop_point: svc ? svc.feature_shop_point : null,
    has_rms_login: svc ? !!svc.rms_login_id : null // 秘密は出さず有無のみ
  })); // item=true, shop=false 期待（サンプル行）
  const none = getServiceRpointup('___notexist___');
  console.log('存在しないid:', none, none === null ? 'OK(null)' : 'NG'); // null 期待
}

/**
 * Phase 1.2 テスト: 拡張 authenticateShop（Layer 0/1/2 + features）
 * 注意: 実行時に testPassword へデコード後パスワードを設定してから実行する。
 */
function testAuthenticationWithFeatures() {
  console.log('--- testAuthenticationWithFeatures ---');
  const testShopId = 'tokyoflower';
  const testPassword = ''; // 実行時に設定
  const result = authenticateShop(testShopId, testPassword);
  console.log('success:', result.success);
  if (result.success) {
    console.log('shopName:', result.shop.sname);
    console.log('features:', JSON.stringify(result.features)); // {item_point:true, shop_point:false} 期待
    console.log('role:', result.role);
  } else {
    console.log('error:', result.error);
  }
}

/**
 * Phase 1.2 テスト: toBool ヘルパー単体
 */
function testToBool() {
  console.log('--- testToBool ---');
  const cases = [
    [true, true], [false, false],
    ['TRUE', true], ['true', true], ['FALSE', false], ['', false],
    [1, true], [0, false], [null, false], [undefined, false]
  ];
  cases.forEach(c => {
    const got = toBool(c[0]);
    console.log('toBool(' + JSON.stringify(c[0]) + ') = ' + got + ' ' + (got === c[1] ? 'OK' : 'NG(期待:' + c[1] + ')'));
  });
}

/**
 * Phase 1.2 テスト: 後方互換の確認
 * - 行のない id でも Layer 1 は fail-open（null → 通過対象）
 * - 行のない id は features 全 false（安全側）
 */
function testBackwardCompat() {
  console.log('--- testBackwardCompat ---');
  const acc = getAccountServices('___notexist___', SERVICE_ID);
  console.log('Layer1 行なし → null（fail-open対象）:', acc === null ? 'OK' : 'NG');
  const svc = getServiceRpointup('___notexist___');
  console.log('Layer2 行なし → null（features全false対象）:', svc === null ? 'OK' : 'NG');
  const features = {
    item_point: svc ? svc.feature_item_point : false,
    shop_point: svc ? svc.feature_shop_point : false
  };
  console.log('既定 features:', JSON.stringify(features),
    (features.item_point === false && features.shop_point === false) ? 'OK' : 'NG');
}