/* Presentation follows switchTab; this module never owns application routing. */
(function (root, doc) {
  'use strict';
  var tabNames = ['money', 'weight', 'menu', 'schedule', 'more'];
  var buttons = [], current = null, pending = null;

  function reducedMotion() {
    return doc.documentElement.classList.contains('reduce-motion') ||
      !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function paint(tabName, animate) {
    buttons.forEach(function (button) {
      var selected = button.dataset.tab === tabName;
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      button.classList.remove('nav-enter');
      if (selected && animate) button.classList.add('nav-enter');
    });
    current = tabName;
  }

  function initialize() {
    if (buttons.length) return true;
    buttons = Array.prototype.slice.call(doc.querySelectorAll('.nav-bar.character-navigation .nav-item[data-tab]'));
    if (!buttons.length) return false;
    var active = buttons.find(function (button) {
      return button.getAttribute('aria-current') === 'page' || button.classList.contains('active-tab');
    });
    buttons.forEach(function (button) {
      function finish() { button.classList.remove('nav-enter'); }
      button.addEventListener('animationend', finish);
      button.addEventListener('animationcancel', finish);
    });
    paint(pending || (active && active.dataset.tab) || 'money', false);
    pending = null;
    return true;
  }

  function sync(tabName) {
    if (tabNames.indexOf(tabName) === -1) return false;
    if (!buttons.length) {
      pending = tabName;
      if (!initialize()) return false;
    }
    if (current === tabName) return false;
    paint(tabName, !reducedMotion());
    return true;
  }

  root.HHCharacterNavigation = {sync: sync};
  if (!initialize()) doc.addEventListener('DOMContentLoaded', initialize, {once: true});
})(window, document);
