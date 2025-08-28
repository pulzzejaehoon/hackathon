#!/usr/bin/env node
import { spawn } from "child_process";
import { execSync } from "child_process";

const child = spawn("claude-code", process.argv.slice(2), {
  stdio: ["pipe", "pipe", "pipe"]
});

// Claude Code 출력 감시
child.stdout.on("data", data => {
  const line = data.toString();
  process.stdout.write(line);

  // 입력 질문이 나오면 알림 보내기
  if (line.includes("?") || line.toLowerCase().includes("yes") || line.toLowerCase().includes("no")) {
    execSync(`terminal-notifier -title "Claude Code" -message "승인 대기 중입니다" -sound default`);
  }
});

child.stderr.on("data", data => {
  process.stderr.write(data.toString());
});
