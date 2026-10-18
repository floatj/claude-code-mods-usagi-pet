# 兔兔 usagi pet

Claude Code 的側欄寵物 mod：兔耳、藍白女僕裝的 Q 版女僕「兔兔」，用彩色半格方塊像素畫成，會跟著 Claude 正在做的事演動畫。

- Claude 跑指令時她打筆電，讀檔時看書，改檔時寫字，搜尋時挖洞，上網時看地球，派出 subagent 時帶小兔子，用 MCP 工具時變魔法。
- 思考比較久時會輪流換場景；回覆結束、開心幾秒之後就會睡著，送出訊息就醒來。
- 可以摸摸她，也可以在側欄玩三線跑酷小遊戲。

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
- `跑酷` 按鈕或 `g`：開始小遊戲。`a` / `d` 換線，`r` 再玩一次，`x` 回到兔兔。
- 按鍵要在面板取得焦點時才有效。

## 修改

- 造型、場景、顏色：`hooks/scenes.ts`
- 心情和字幕：`hooks/bunny.ts`
- 事件掛鉤和面板：`hooks/register.tsx`
- 小遊戲：`hooks/game.ts`

檢查有沒有改壞：

```sh
claude plugin validate ~/.claude/mods/bunny
claude plugin test ~/.claude/mods/bunny
```

## 致謝

動畫的做法（依工具和 spinner 文字換場景、計時器推動畫格）參考了 Brian Huang 的 [clawd-actor](https://github.com/BrianHuang813/clawd-actor)（MIT 授權），少數小函式沿用它的寫法，授權聲明附在 [LICENSE](LICENSE)。

## 授權

[MIT](LICENSE)
