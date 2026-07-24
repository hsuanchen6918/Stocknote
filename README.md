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
- 資料儲存在瀏覽器 localStorage。

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
