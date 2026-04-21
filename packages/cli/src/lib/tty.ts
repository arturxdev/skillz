export function requireTTY(command: string, hint: string): void {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error(`${command} requires an interactive terminal.`);
    console.error(`Non-interactive usage: ${hint}`);
    process.exit(1);
  }
}
