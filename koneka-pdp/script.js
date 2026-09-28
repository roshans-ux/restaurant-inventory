(function () {
  const qtyInput = document.getElementById("quantity");
  const qtyButtons = document.querySelectorAll(".qty-btn");

  qtyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      let val = parseInt(qtyInput.value, 10) || 1;
      if (action === "increase" && val < 10) val += 1;
      if (action === "decrease" && val > 1) val -= 1;
      qtyInput.value = String(val);
    });
  });

  const thumbs = document.querySelectorAll(".thumb");
  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      thumbs.forEach((t) => {
        t.classList.remove("thumb--active");
        t.setAttribute("aria-selected", "false");
      });
      thumb.classList.add("thumb--active");
      thumb.setAttribute("aria-selected", "true");
    });
  });

  const form = document.querySelector(".purchase-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const qty = qtyInput?.value ?? "1";
    const btn = form.querySelector(".btn-primary");
    if (btn) {
      const original = btn.textContent;
      btn.textContent = `Added (${qty})`;
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1800);
    }
  });
})();
