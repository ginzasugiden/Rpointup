/**
 * ポイント変倍侍 GASスクリプト（マルチテナント対応版）
 * CORS対応版
 */

// ====================================
// 設定
// ====================================

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
 * 店舗認証（ID + パスワード）
 */
function authenticateShop(shopId, password) {
  const shops = getShopsData();
  const shop = shops.find(s => s.id === shopId);
  
  if (!shop) {
    return { success: false, error: '店舗IDが見つかりません' };
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
  
  return { success: true, shop: shop };
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
        results: results
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