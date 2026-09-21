# Stocknote

Stocknote 是一個台股與美股投資記錄工具，支援庫存損益追蹤、即時報價、自選股看盤、加碼試算與 Google 帳號同步。

這個專案的目標是提供一個乾淨、可跨裝置使用的個人投資儀表板。未登入時主頁不會顯示任何帳號庫存；登入後才會載入該 Google 帳號的雲端資料。

## Web

https://stocknote88.netlify.app/

一般使用者可以直接開啟上方網址使用，不需要在本機安裝或啟動專案。

## Features

- 台股上市報價：透過 TWSE MIS 取得即時價格。
- 台股上櫃報價：透過 TWSE MIS OTC 參數取得即時價格。
- 美股報價：透過 Yahoo Finance 查詢。
- 投資組合管理：記錄股數、總成本、手續費、其他費用與成本幣別。
- 損益計算：自動計算市值、未實現損益、報酬率與平均成本。
- 自選股看盤：可自行新增台股或美股，並每分鐘檢查最新報價。
- 加碼試算：模擬追加買入後的新平均成本與目標價損益。
- Google 帳號同步：登入後透過 Netlify Identity 與 Netlify Blobs 同步庫存與自選清單。
- 行動裝置支援：針對手機版導覽與安全區做了響應式調整。

## Data And Sync Behavior

Stocknote 的資料行為分成「投資組合」與「即時看盤自選清單」：

- 投資組合：未登入時主頁預設為空白，不會讀取或顯示帳號庫存。登入 Google 後，才會載入該帳號的雲端庫存。
- 投資組合登出：登出後會立即清空畫面上的庫存資料。
- 即時看盤自選清單：未登入時會保存在目前瀏覽器；登入後可同步到 Google 帳號，跨裝置載入。
- 報價資料：每個裝置定期重新查詢報價，避免把每分鐘價格更新都寫入雲端。

## Tech Stack

- Next.js
- React
- Vinext
- TypeScript
- Tailwind CSS
- Netlify Hosting
- Netlify Identity
- Netlify Blobs

## Local Development

以下步驟只提供給想在本機修改或開發 Stocknote 的開發者；一般使用請直接開啟 Live App。

需求：

- Node.js `>=22.13.0`
- npm

安裝依賴：

```powershell
npm install
```

在 Windows PowerShell 啟動開發環境：

```powershell
$env:WRANGLER_LOG_PATH=".wrangler/wrangler.log"
.\node_modules\.bin\vinext.cmd dev
```

開發伺服器啟動後，打開終端機顯示的本機網址。

## Build Locally

在 Windows PowerShell 建置：

```powershell
$env:WRANGLER_LOG_PATH=".wrangler/wrangler.log"
.\node_modules\.bin\vinext.cmd build
```

在 macOS、Linux 或支援 POSIX-style environment variables 的環境中，也可以使用：

```bash
npm run build
```

## Cloud Sync Setup

若要啟用 Google 登入與跨裝置同步，需要在部署環境設定：

1. 啟用 Netlify Identity。
2. 在 Netlify Identity 的 external providers 啟用 Google。
3. 啟用 Netlify Blobs，供庫存與自選清單儲存使用。
4. 重新部署網站。

同步 API 會依登入使用者 ID 分開儲存資料，不同 Google 帳號不會共用庫存或自選清單。

## Project Structure

```text
app/
  api/
    holdings/    Google 帳號庫存同步 API
    lookup/      股票搜尋與報價查詢 API
    quote/       單一股票報價 API
    watchlist/   即時看盤自選清單同步 API
  watchlist/     即時看盤頁面
  page.tsx       投資組合與加碼試算主頁
public/          PWA 圖示與靜態資源
```

## Disclaimer

Stocknote 僅供個人記錄、報價查看與試算使用，不構成任何投資建議。報價資料可能延遲、缺漏或因第三方服務異常而暫時不可用；實際交易前請以券商或交易所資料為準。

## License

目前尚未指定開源授權。若要公開給其他人使用或貢獻，建議補上明確的 License。
