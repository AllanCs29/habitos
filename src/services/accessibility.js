export function installAccessibility() {
  let lastFocus = null;
  function enhance() {
    for (const field of document.querySelectorAll("input,select,textarea")) {
      if (
        field.id &&
        !field.labels?.length &&
        !field.hasAttribute("aria-label")
      )
        field.setAttribute(
          "aria-label",
          field.placeholder ||
            field.title ||
            field.id.replace(/([A-Z])/g, " $1"),
        );
    }
    for (const label of document.querySelectorAll("label:not([for])")) {
      const sibling = label.parentElement?.querySelector(
        "input[id],select[id],textarea[id]",
      );
      if (sibling) label.htmlFor = sibling.id;
    }
    for (const button of document.querySelectorAll("button")) {
      if (!button.hasAttribute("type")) button.type = "button";
      if (!button.textContent.trim() && !button.hasAttribute("aria-label"))
        button.setAttribute(
          "aria-label",
          button.title ||
            button
              .querySelector("i")
              ?.className.split(" ")
              .find((x) => x.startsWith("fi-"))
              ?.replace(/^fi-[rs][rr]-/, "")
              .replace(/-/g, " ") ||
            "Abrir opción",
        );
    }
    const modal = [...document.querySelectorAll("[data-modal]")].find(
      (el) => !el.classList.contains("hidden"),
    );
    if (modal) {
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      if (!modal.contains(document.activeElement)) {
        lastFocus = document.activeElement;
        modal.querySelector("button,input,select,textarea")?.focus();
      }
    }
  }
  document.addEventListener("tcc:render", enhance);
  enhance();
  new MutationObserver((records) => {
    if (records.some((r) => r.target.hasAttribute?.("data-modal"))) enhance();
  }).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  document.addEventListener("keydown", (e) => {
    const modal = [...document.querySelectorAll("[data-modal]")]
      .filter((el) => !el.classList.contains("hidden"))
      .at(-1);
    if (!modal) return;
    if (e.key === "Escape") {
      const close = modal.querySelector("[data-close]");
      if (close) {
        close.click();
        lastFocus?.focus();
      }
    }
    if (e.key === "Tab") {
      const focusable = [
        ...modal.querySelectorAll(
          'button,input,select,textarea,a[href],[tabindex="0"]',
        ),
      ].filter((el) => !el.disabled && el.getClientRects().length);
      const first = focusable[0],
        last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
}
