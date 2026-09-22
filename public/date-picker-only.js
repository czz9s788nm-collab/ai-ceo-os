(function () {
  'use strict';

  const selector = 'input[type="date"], input[type="month"]';

  function dateFieldFrom(target) {
    return target instanceof Element ? target.closest(selector) : null;
  }

  function prepareDateField(field) {
    if (!(field instanceof HTMLInputElement) || !field.matches(selector)) return;
    field.dataset.datePickerOnly = 'true';
    field.setAttribute('inputmode', 'none');
    field.setAttribute('autocomplete', 'off');
    field.spellcheck = false;
  }

  function prepareDateFields(root) {
    if (root instanceof HTMLInputElement && root.matches(selector)) prepareDateField(root);
    if (root.querySelectorAll) root.querySelectorAll(selector).forEach(prepareDateField);
  }

  function openDatePicker(field) {
    prepareDateField(field);
    if (field.disabled || field.readOnly || typeof field.showPicker !== 'function') return false;
    try {
      field.focus({ preventScroll: true });
      field.showPicker();
      return true;
    } catch (_) {
      return false;
    }
  }

  prepareDateFields(document);

  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) prepareDateFields(node);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('focusin', (event) => {
    const field = dateFieldFrom(event.target);
    if (field) prepareDateField(field);
  });

  document.addEventListener('click', (event) => {
    const field = dateFieldFrom(event.target);
    if (!field) return;
    if (openDatePicker(field)) event.preventDefault();
  });

  document.addEventListener('keydown', (event) => {
    const field = dateFieldFrom(event.target);
    if (!field || event.key === 'Tab' || event.key === 'Escape') return;
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') openDatePicker(field);
  });

  ['beforeinput', 'paste', 'drop'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (dateFieldFrom(event.target)) event.preventDefault();
    });
  });
}());
