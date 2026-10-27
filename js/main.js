/* =========================================================
   Кузнецов — частная мастерская
   Интерактив: меню, фильтры, лайтбокс, появление, форма
   ========================================================= */

(function () {
  "use strict";

  /* -----------------------------------------------------------
     FormSubmit с зашифрованной почтой
     ----------------------------------------------------------- */
  (function () {
    const encEmail = "cGFzaGFrcnV0b2o3MzhAZ21haWwuY29t";
    const formEl = document.getElementById("project-form");
    if (formEl) {
      try {
        formEl.action = "https://formsubmit.co/" + atob(encEmail);
      } catch (e) {
        // игнорируем
      }
    }
  })();

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- шапка и прогресс прокрутки ---------- */

  const header = $("#header");
  const progress = $("#scroll-progress");
  let lastScroll = window.scrollY;

  function onScroll() {
    const scrollTop = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;

    header.classList.toggle("is-scrolled", scrollTop > 24);

    if (progress) {
      progress.style.transform = "scaleX(" + (max > 0 ? Math.min(scrollTop / max, 1) : 0) + ")";
    }

    lastScroll = scrollTop;
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  /* ---------- мобильное меню ---------- */

  const burger = $("#burger");
  const nav = $("#nav");

  function closeMenu() {
    if (!nav || !burger) return;
    nav.classList.remove("is-open");
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Открыть меню");
    document.body.classList.remove("no-scroll");
  }

  function openMenu() {
    nav.classList.add("is-open");
    burger.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Закрыть меню");
    document.body.classList.add("no-scroll");
  }

  if (burger && nav) {
    burger.addEventListener("click", function () {
      if (nav.classList.contains("is-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    $$("a", nav).forEach((link) => link.addEventListener("click", closeMenu));

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        closeMenu();
        burger.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 980) closeMenu();
    });
  }

  /* ---------- фильтр работ ---------- */

  const filterButtons = $$(".filter");
  const workCards = $$(".work");

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const filter = button.dataset.filter;

      filterButtons.forEach(function (item) {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });

      workCards.forEach(function (card) {
        const matches = filter === "all" || card.dataset.category === filter;
        card.classList.toggle("is-hidden", !matches);

        if (matches) {
          card.classList.remove("is-in");
          void card.offsetWidth;
          card.classList.add("is-in");
        }
      });
    });
  });

  filterButtons.forEach(function (button) {
    button.setAttribute("aria-pressed", button.classList.contains("is-active") ? "true" : "false");
  });

  /* ---------- лайтбокс ---------- */

  const lightbox = $("#lightbox");
  const lightboxImage = $("#lightbox-img");
  const lightboxTitle = $("#lightbox-title");
  const lightboxDesc = $("#lightbox-desc");
  const lightboxClose = $(".lightbox__close");
  const lightboxPrev = $(".lightbox__nav--prev");
  const lightboxNext = $(".lightbox__nav--next");
  const triggers = $$("[data-lightbox]");

  let activeItems = [];
  let currentIndex = 0;
  let lastTrigger = null;

  function renderSlide() {
    const trigger = activeItems[currentIndex];
    if (!trigger) return;

    const innerImage = $("img", trigger);

    lightboxImage.src = trigger.dataset.src || (innerImage ? innerImage.src : "");
    lightboxImage.alt = innerImage ? innerImage.alt : trigger.dataset.title || "";
    lightboxTitle.textContent = trigger.dataset.title || "";
    lightboxDesc.textContent = trigger.dataset.desc || "";

    const hasMany = activeItems.length > 1;
    lightboxPrev.hidden = !hasMany;
    lightboxNext.hidden = !hasMany;
  }

  function openLightbox(trigger) {
    activeItems = triggers.filter(function (item) {
      const card = item.closest(".work");
      return !card || !card.classList.contains("is-hidden");
    });

    currentIndex = Math.max(activeItems.indexOf(trigger), 0);
    lastTrigger = trigger;

    renderSlide();
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");

    window.setTimeout(function () {
      lightboxClose.focus();
    }, 60);
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");

    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  function showSlide(step) {
    if (!activeItems.length) return;
    currentIndex = (currentIndex + step + activeItems.length) % activeItems.length;
    renderSlide();
  }

  triggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      openLightbox(trigger);
    });
  });

  if (lightbox) {
    lightboxClose.addEventListener("click", closeLightbox);
    lightboxPrev.addEventListener("click", function () {
      showSlide(-1);
    });
    lightboxNext.addEventListener("click", function () {
      showSlide(1);
    });

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", function (event) {
      if (!lightbox.classList.contains("is-open")) return;

      if (event.key === "Escape") {
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        showSlide(-1);
      } else if (event.key === "ArrowRight") {
        showSlide(1);
      } else if (event.key === "Tab") {
        const focusable = $$("button:not([hidden])", lightbox).filter(function (el) {
          return el.offsetParent !== null;
        });

        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* ---------- появление при прокрутке ---------- */

  const revealItems = $$(".reveal");

  if ("IntersectionObserver" in window && !prefersReducedMotion) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" }
    );

    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
  }

  /* ---------- форма заявки ---------- */
  const form = $("#project-form");
  const errorBox = $("#form-error");

  if (form && errorBox) {
    form.addEventListener("submit", function (event) {
      if (!errorBox.hidden) errorBox.hidden = true;

      if (!form.checkValidity()) {
        event.preventDefault();
        form.reportValidity();
        return;
      }

      const honey = form.querySelector('input[name="_honey"]');
      if (honey && honey.value) {
        event.preventDefault();
        return;
      }
    });

    form.addEventListener("input", function () {
      if (!errorBox.hidden) errorBox.hidden = true;
    });
  }
})();
