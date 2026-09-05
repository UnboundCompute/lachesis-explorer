export async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === "undefined") throw new Error("Clipboard unavailable");
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard fallback failed");
}

export function downloadText(value: string, filename: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Downloads unavailable")
  }
  const href = URL.createObjectURL(new Blob([value], { type: "text/markdown;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = href
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)
}
