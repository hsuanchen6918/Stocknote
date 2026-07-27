# Stocknote

台股與美股庫存管理、即時報價、持續買入試算工具。

## 功能

- 台股上市即時報價使用 TWSE MIS。
- 台股上櫃即時報價使用 MIS OTC 參數。
- 美股報價目前維持 Yahoo Finance。
- 可輸入庫存股數、總成本、手續費與其他費用。
- 美股成本可選美元或台幣。
- 自動計算目前市值、未實現損益、未實現報酬率與平均成本。
- 每 1 分鐘自動檢查報價。
- 可模擬持續買入後的新成本與預期股價損益。
- 沒登入時資料儲存在瀏覽器 localStorage。
- 部署到 Netlify 後，可用 Google 登入並透過 Netlify Blobs 跨裝置同步庫存。

## Netlify 跨裝置同步設定

同步功能需要在 Netlify 後台啟用：

1. 到 Netlify 專案設定啟用 Identity。
2. 在 Identity 的 external providers 啟用 Google 登入。
3. 重新部署後，網頁右上角按「Google 同步登入」。

第一次登入時，如果雲端還沒有庫存，會把目前這台裝置的庫存匯入雲端；之後新增、編輯、刪除庫存會自動同步。報價仍由各裝置每 1 分鐘各自更新，避免每分鐘把報價寫回雲端。

## 開啟網頁

需求：Node.js `>=22.13.0`

在 Windows PowerShell 執行：

```powershell
npm install
$env:WRANGLER_LOG_PATH=".wrangler/wrangler.log"
.\node_modules\.bin\vinext.cmd dev
```

接著打開終端機顯示的本機網址。

## 常用指令

```powershell
$env:WRANGLER_LOG_PATH=".wrangler/wrangler.log"
.\node_modules\.bin\vinext.cmd build
```

## 技術

- Next.js
- React
- Vinext
- Cloudflare Sites
