# 兔兔 usagi pet

Claude Code 的側欄寵物 mod：兔耳、藍白女僕裝的 Q 版女僕「兔兔」，用彩色半格方塊像素畫成，會跟著 Claude 正在做的事演動畫。

- 開新 session 時，從五種開機畫面裡隨機播一種：掌機開機、BIOS 自檢、兔子洞、召喚陣、讀取組裝。
- Claude 跑指令時她打筆電，讀檔時看書，改檔時寫字，搜尋時挖洞，上網時看地球，派出 subagent 時帶小兔子，用 MCP 工具時變魔法。
- 思考比較久時會輪流換場景；回覆結束、開心幾秒之後就會睡著，送出訊息就醒來。
- 睡著時旁邊有一扇窗（面板內容區 22 欄以上才畫得下）：白天太陽、傍晚夕陽、晚上月亮；外面下雨或下雪時窗外會下雨，雷雨會打閃電（見下方「窗外的天氣」）。
- 特別演出：送出訊息時偶爾會變身成魔法少女；一輪工作超過 2 分鐘才完成，會發射全力魔炮（結束前幾秒有工具出錯、或還在播其他特別演出時不會）；睡著時被你的訊息叫醒，多半會拉起裙擺說「歡迎回來」，偶爾直接變身。
- 惡搞小劇場：
  - Claude 改檔案時，偶爾（每次 5%）會有百變怪來訪，變成另一個兔兔。
  - 工具出錯時，偶爾（合計 17%）不是難過，而是 cosplay 成阿克婭表演噴水失敗大哭，或是謎擬Q 來訪、換上兔兔布偶裝，頭掉下來把她嚇昏。
  - 回覆完成時，偶爾（7%）會 cosplay 成小丑跳「藍藍路」。
  - 思考開始的頭 15 秒內，spinner 出現跟音樂有關的字（例如 Vibing、Humming）時，會 cosplay 成初音甩蔥。
- 可以摸摸她，也可以一次播放所有動畫。

## 安裝

需要支援 mod 的 Claude Code 版本（筆者用 v2.1.302）。

```sh
git clone https://github.com/floatj/claude-code-mods-usagi-pet ~/.claude/mods/bunny
```

先試玩：

```sh
claude --plugin-dir ~/.claude/mods/bunny
```

想每次都自動載入，在 `~/.claude/settings.json` 的 `env` 加上（路徑換成你的家目錄，多個 mod 用 `:` 隔開）：

```json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "/Users/你的帳號/.claude/mods/bunny"
}
```

## 使用

- `/bunny`：叫出兔兔面板。
- 面板停靠在對話旁邊需要 fullscreen 版面，而且終端機至少 110 欄寬；開 session 時，144 欄以上會自動出現；用 `/bunny` 叫出來過一次之後（沒有手動關掉），110 欄以上就會自動出現。比 110 欄窄時，`/bunny` 會把她開在輸入框上方。
- `♡` 按鈕或 `p`：摸摸她。
- `▶` 按鈕或 `r`：依序播放所有動畫，字幕會顯示正在播第幾段；播放中按鈕變成 `■`，再按一次停止。
- 按鍵要在面板取得焦點時才有效。

## 窗外的天氣

睡著時的窗戶會依你所在地的天氣下雨或打雷，這需要連網：

- 第一次查天氣前，先用你的 IP 位址查大概位置：先問 [ipwho.is](https://ipwho.is/)，查不到再問 [GeoJS](https://www.geojs.io/)；兩個都查不到的話，下次查天氣時再試。座標只取到小數點後兩位（約 1 公里），只用來查天氣。
- 再用這個座標向 [Open-Meteo](https://open-meteo.com/) 查目前天氣：開 session 時查一次，之後每 30 分鐘一次。
- 這些服務都會看到你的 IP 位址。斷網或查詢失敗時，窗戶維持上一次的天氣，一開始是晴天。
- 目前沒有關閉這個功能的設定；不想連網的話，要自己拿掉 `hooks/register.tsx` 裡呼叫 `readWeather` 的地方。

## 修改

- 造型、場景、顏色：`hooks/scenes.ts`
- 心情和字幕：`hooks/bunny.ts`
- 事件掛鉤和面板：`hooks/register.tsx`
- 天氣查詢：`hooks/weather.ts`

檢查有沒有改壞：

```sh
claude plugin validate ~/.claude/mods/bunny
claude plugin test ~/.claude/mods/bunny
```

## 致謝

動畫的做法（依工具和 spinner 文字換場景、計時器推動畫格）參考了 Brian Huang 的 [clawd-actor](https://github.com/BrianHuang813/clawd-actor)（MIT 授權），少數小函式沿用它的寫法，授權聲明附在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 授權

[MIT](LICENSE)
