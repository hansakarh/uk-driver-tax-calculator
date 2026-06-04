'use strict';

/* -------------------------------------------------------------------
   Input Security Limits
   ------------------------------------------------------------------- */
const INPUT_LIMITS = {
  earnings: { max: 9999999.99, decimals: true  },
  mileage:  { max: 500000,     decimals: false },
  expenses: { max: 9999999.99, decimals: true  },
  hours:    { max: 168,        decimals: true  },
};

/* -------------------------------------------------------------------
   HMRC 2025/26 Tax Constants
   ------------------------------------------------------------------- */
const HMRC = {
  PERSONAL_ALLOWANCE:    12570,
  BASIC_RATE_THRESHOLD:  50270,
  HIGHER_RATE_THRESHOLD: 125140,
  BASIC_RATE:            0.20,
  HIGHER_RATE:           0.40,
  CLASS4_LOWER_RATE:     0.06,
  CLASS4_UPPER_RATE:     0.02,
  MILEAGE_RATE_FIRST:    0.45,
  MILEAGE_RATE_AFTER:    0.25,
  MILEAGE_THRESHOLD:     10000,
};

/* -------------------------------------------------------------------
   DOM Element Cache
   ------------------------------------------------------------------- */
let DOM = {};

function cacheDOMElements() {
  DOM = {
    form:               document.getElementById('tax-form'),
    grossEarnings:      document.getElementById('gross-earnings'),
    earningsPeriod:     document.getElementById('earnings-period'),
    annualMileage:      document.getElementById('annual-mileage'),
    otherExpenses:      document.getElementById('other-expenses'),
    calculateBtn:       document.getElementById('calculate-btn'),
    formError:          document.getElementById('form-error'),
    resultsCard:        document.getElementById('results-card'),
    monthlyTakehome:    document.getElementById('monthly-takehome'),
    annualTakehome:     document.getElementById('annual-takehome'),
    incomeTaxValue:     document.getElementById('income-tax-value'),
    class4NiValue:      document.getElementById('class4-ni-value'),
    mileageReliefValue: document.getElementById('mileage-relief-value'),
    totalExpensesValue: document.getElementById('total-expenses-value'),
    barTakehome:        document.getElementById('bar-takehome'),
    barTax:             document.getElementById('bar-tax'),
    barNi:              document.getElementById('bar-ni'),
    barExpenses:        document.getElementById('bar-expenses'),
    pctTakehome:        document.getElementById('pct-takehome'),
    pctTax:             document.getElementById('pct-tax'),
    pctNi:              document.getElementById('pct-ni'),
    pctExpenses:        document.getElementById('pct-expenses'),
    pdfBtn:             document.getElementById('pdf-btn'),
    hoursWorked:        document.getElementById('hours-worked'),
    realHourlyRate:     document.getElementById('real-hourly-rate'),
    // Calculation breakdown accordion
    csGrossDesc:        document.getElementById('cs-gross-desc'),
    csGrossVal:         document.getElementById('cs-gross-val'),
    csMileFirstDesc:    document.getElementById('cs-mile-first-desc'),
    csMileFirstVal:     document.getElementById('cs-mile-first-val'),
    csMileExtraRow:     document.getElementById('cs-mile-extra-row'),
    csMileExtraDesc:    document.getElementById('cs-mile-extra-desc'),
    csMileExtraVal:     document.getElementById('cs-mile-extra-val'),
    csMileTotalVal:     document.getElementById('cs-mile-total-val'),
    csOtherExpVal:      document.getElementById('cs-other-exp-val'),
    csTotalDedVal:      document.getElementById('cs-total-ded-val'),
    csNetProfitDesc:    document.getElementById('cs-net-profit-desc'),
    csNetProfitVal:     document.getElementById('cs-net-profit-val'),
    csTaxableIncomeVal: document.getElementById('cs-taxable-income-val'),
    csTaxBasicDesc:     document.getElementById('cs-tax-basic-desc'),
    csTaxBasicVal:      document.getElementById('cs-tax-basic-val'),
    csTaxHigherRow:     document.getElementById('cs-tax-higher-row'),
    csTaxHigherDesc:    document.getElementById('cs-tax-higher-desc'),
    csTaxHigherVal:     document.getElementById('cs-tax-higher-val'),
    csTaxTotalVal:      document.getElementById('cs-tax-total-val'),
    csNiLowerDesc:      document.getElementById('cs-ni-lower-desc'),
    csNiLowerVal:       document.getElementById('cs-ni-lower-val'),
    csNiUpperRow:       document.getElementById('cs-ni-upper-row'),
    csNiUpperDesc:      document.getElementById('cs-ni-upper-desc'),
    csNiUpperVal:       document.getElementById('cs-ni-upper-val'),
    csNiTotalVal:       document.getElementById('cs-ni-total-val'),
  };
}

/* -------------------------------------------------------------------
   Utility Functions
   ------------------------------------------------------------------- */

function formatNumber(value) {
  return new Intl.NumberFormat('en-GB').format(value);
}

function formatCurrency(value) {
  const num = parseFloat(value);
  if (!isFinite(num)) return '£0.00';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, num));
}

function formatPercent(value) {
  const pct = Math.min(100, Math.max(0, value));
  return pct.toFixed(1) + '%';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseInput(element) {
  const val = parseFloat(element.value);
  return isFinite(val) && val >= 0 ? val : 0;
}

/*
 * Strips non-numeric characters and enforces an upper bound in real time.
 * Called on every `input` event so malformed values never reach calculateTax().
 * type="number" inputs block HTML but can still accept scientific notation
 * (e.g. 1e308 → Infinity) — this catches that before parseFloat sees it.
 */
function sanitizeNumericInput(element, maxValue, allowDecimals) {
  const raw = element.value;
  if (raw === '') return;

  // Strip everything except digits and decimal point
  let cleaned = raw.replace(/[^0-9.]/g, '');

  if (!allowDecimals) {
    cleaned = cleaned.replace(/\./g, '');
  } else {
    // Keep only the first decimal point
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1)
              + cleaned.slice(firstDot + 1).replace(/\./g, '');
      // Limit to 2 decimal places
      if (cleaned.length - firstDot - 1 > 2) {
        cleaned = cleaned.slice(0, firstDot + 3);
      }
    }
  }

  // Enforce upper bound — write back immediately so user sees the cap
  const num = parseFloat(cleaned);
  if (isFinite(num) && num > maxValue) {
    element.value = allowDecimals ? maxValue.toFixed(2) : String(maxValue);
    return;
  }

  // Only rewrite DOM value if it actually changed (prevents cursor-position jump)
  if (cleaned !== raw) {
    element.value = cleaned;
  }
}

function setBarWidth(barEl, pctEl, percentage) {
  const clamped = clamp(percentage, 0, 100);
  barEl.style.width = clamped + '%';
  pctEl.textContent = formatPercent(clamped);
}

/* -------------------------------------------------------------------
   Core Tax Calculation (pure function — no DOM access)
   ------------------------------------------------------------------- */
function calculateTax(grossEarnings, period, annualMileage, otherExpenses) {
  // Step 1: Annualise gross earnings
  let annualGross;
  if (period === 'weekly') {
    annualGross = grossEarnings * 52;
  } else if (period === 'monthly') {
    annualGross = grossEarnings * 12;
  } else {
    annualGross = grossEarnings;
  }

  // Step 2: HMRC Approved Mileage Allowance (AMAP) — split into tiers for breakdown display
  const milesFirst   = Math.min(annualMileage, HMRC.MILEAGE_THRESHOLD);
  const milesExtra   = Math.max(0, annualMileage - HMRC.MILEAGE_THRESHOLD);
  const mileageFirst = milesFirst * HMRC.MILEAGE_RATE_FIRST;
  const mileageExtra = milesExtra * HMRC.MILEAGE_RATE_AFTER;
  const mileageRelief = mileageFirst + mileageExtra;

  // Step 3: Total allowable deductions
  const totalDeductions = mileageRelief + otherExpenses;

  // Step 4: Net taxable profit (cannot go below zero)
  const netProfit = Math.max(0, annualGross - totalDeductions);

  // Step 5: Taxable income after personal allowance
  const taxableIncome = Math.max(0, netProfit - HMRC.PERSONAL_ALLOWANCE);

  // Step 6: Income Tax — named portions for breakdown display
  const basicRateBand        = HMRC.BASIC_RATE_THRESHOLD - HMRC.PERSONAL_ALLOWANCE;
  const basicTaxablePortion  = Math.min(taxableIncome, basicRateBand);
  const higherTaxablePortion = Math.max(0, taxableIncome - basicRateBand);
  const incomeTaxBasic  = basicTaxablePortion  * HMRC.BASIC_RATE;
  const incomeTaxHigher = higherTaxablePortion * HMRC.HIGHER_RATE;
  const incomeTax = incomeTaxBasic + incomeTaxHigher;

  // Step 7: Class 4 National Insurance — named amounts for breakdown display
  const class4LowerBand   = clamp(netProfit - HMRC.PERSONAL_ALLOWANCE, 0, basicRateBand);
  const class4UpperBand   = Math.max(0, netProfit - HMRC.BASIC_RATE_THRESHOLD);
  const class4LowerAmount = class4LowerBand * HMRC.CLASS4_LOWER_RATE;
  const class4UpperAmount = class4UpperBand * HMRC.CLASS4_UPPER_RATE;
  const class4NI = class4LowerAmount + class4UpperAmount;

  // Step 8: Net take-home pay
  const annualTakehome  = Math.max(0, annualGross - incomeTax - class4NI - totalDeductions);
  const monthlyTakehome = annualTakehome / 12;

  // Step 9: Progress bar percentages (relative to annual gross)
  const safeDivisor = annualGross > 0 ? annualGross : 1;
  const pctTakehome  = clamp((annualTakehome  / safeDivisor) * 100, 0, 100);
  const pctTax       = clamp((incomeTax       / safeDivisor) * 100, 0, 100);
  const pctNI        = clamp((class4NI        / safeDivisor) * 100, 0, 100);
  const pctExpenses  = clamp((totalDeductions / safeDivisor) * 100, 0, 100);

  return {
    // Summary values (used by progress bars and main display)
    annualGross,
    mileageRelief,
    totalDeductions,
    netProfit,
    taxableIncome,
    incomeTax,
    class4NI,
    annualTakehome,
    monthlyTakehome,
    pctTakehome,
    pctTax,
    pctNI,
    pctExpenses,
    // Breakdown values (used by the calculation steps accordion)
    inputGross: grossEarnings,
    period,
    otherExpenses,
    milesFirst,
    milesExtra,
    mileageFirst,
    mileageExtra,
    basicTaxablePortion,
    higherTaxablePortion,
    incomeTaxBasic,
    incomeTaxHigher,
    class4LowerBand,
    class4LowerAmount,
    class4UpperBand,
    class4UpperAmount,
  };
}

/* -------------------------------------------------------------------
   Input Validation
   ------------------------------------------------------------------- */
function validateInputs(gross, period, mileage, expenses) {
  if (!isFinite(gross) || gross <= 0) {
    return { valid: false, message: 'Please enter a valid gross earnings amount greater than zero.' };
  }
  if (gross > 10000000) {
    return { valid: false, message: 'Earnings seem too high — please check your entry.' };
  }
  if (!['weekly', 'monthly', 'annually'].includes(period)) {
    return { valid: false, message: 'Please select a valid earnings period.' };
  }
  if (!isFinite(mileage) || mileage < 0 || mileage > 500000) {
    return { valid: false, message: 'Please enter a valid annual mileage between 0 and 500,000 miles.' };
  }
  if (!isFinite(expenses) || expenses < 0) {
    return { valid: false, message: 'Other expenses cannot be negative.' };
  }
  return { valid: true };
}

/* -------------------------------------------------------------------
   Calculation Breakdown Accordion — Step-by-step population
   ------------------------------------------------------------------- */
function populateBreakdown(r) {
  // Step 1: Annualised Gross
  if (r.period === 'annually') {
    DOM.csGrossDesc.textContent = formatCurrency(r.inputGross) + ' — entered as annual figure';
  } else {
    const mult = r.period === 'weekly' ? '× 52 weeks' : '× 12 months';
    DOM.csGrossDesc.textContent = formatCurrency(r.inputGross) + ' ' + mult;
  }
  DOM.csGrossVal.textContent = formatCurrency(r.annualGross);

  // Step 2: Mileage Relief
  DOM.csMileFirstDesc.textContent = formatNumber(r.milesFirst) + ' miles × £0.45 per mile';
  DOM.csMileFirstVal.textContent  = formatCurrency(r.mileageFirst);
  if (r.milesExtra > 0) {
    DOM.csMileExtraRow.removeAttribute('hidden');
    DOM.csMileExtraDesc.textContent = formatNumber(r.milesExtra) + ' miles × £0.25 per mile';
    DOM.csMileExtraVal.textContent  = formatCurrency(r.mileageExtra);
  } else {
    DOM.csMileExtraRow.setAttribute('hidden', '');
  }
  DOM.csMileTotalVal.textContent = formatCurrency(r.mileageRelief);

  // Step 3: Net Taxable Profit
  DOM.csOtherExpVal.textContent  = formatCurrency(r.otherExpenses);
  DOM.csTotalDedVal.textContent  = formatCurrency(r.totalDeductions);
  DOM.csNetProfitDesc.textContent = formatCurrency(r.annualGross)
    + ' − ' + formatCurrency(r.totalDeductions);
  DOM.csNetProfitVal.textContent  = formatCurrency(r.netProfit);

  // Step 4: Income Tax
  DOM.csTaxableIncomeVal.textContent = formatCurrency(r.taxableIncome);
  DOM.csTaxBasicDesc.textContent  = formatCurrency(r.basicTaxablePortion) + ' × 20%';
  DOM.csTaxBasicVal.textContent   = formatCurrency(r.incomeTaxBasic);
  if (r.incomeTaxHigher > 0) {
    DOM.csTaxHigherRow.removeAttribute('hidden');
    DOM.csTaxHigherDesc.textContent = formatCurrency(r.higherTaxablePortion) + ' × 40%';
    DOM.csTaxHigherVal.textContent  = formatCurrency(r.incomeTaxHigher);
  } else {
    DOM.csTaxHigherRow.setAttribute('hidden', '');
  }
  DOM.csTaxTotalVal.textContent = formatCurrency(r.incomeTax);

  // Step 5: Class 4 National Insurance
  DOM.csNiLowerDesc.textContent = formatCurrency(r.class4LowerBand) + ' × 6%';
  DOM.csNiLowerVal.textContent  = formatCurrency(r.class4LowerAmount);
  if (r.class4UpperBand > 0) {
    DOM.csNiUpperRow.removeAttribute('hidden');
    DOM.csNiUpperDesc.textContent = formatCurrency(r.class4UpperBand) + ' × 2%';
    DOM.csNiUpperVal.textContent  = formatCurrency(r.class4UpperAmount);
  } else {
    DOM.csNiUpperRow.setAttribute('hidden', '');
  }
  DOM.csNiTotalVal.textContent = formatCurrency(r.class4NI);
}

/* -------------------------------------------------------------------
   Error Display
   ------------------------------------------------------------------- */
function showError(message) {
  DOM.formError.textContent = message;
  DOM.formError.removeAttribute('hidden');
  DOM.formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearError() {
  DOM.formError.textContent = '';
  DOM.formError.setAttribute('hidden', '');
}

/* -------------------------------------------------------------------
   DOM Update — Render Results
   ------------------------------------------------------------------- */
function updateResults(results) {
  // Currency values
  DOM.monthlyTakehome.textContent    = formatCurrency(results.monthlyTakehome);
  DOM.annualTakehome.textContent     = formatCurrency(results.annualTakehome);
  DOM.incomeTaxValue.textContent     = formatCurrency(results.incomeTax);
  DOM.class4NiValue.textContent      = formatCurrency(results.class4NI);
  DOM.mileageReliefValue.textContent = formatCurrency(results.mileageRelief);
  DOM.totalExpensesValue.textContent = formatCurrency(results.totalDeductions);

  // Real hourly earnings
  var hoursPerWeek = parseInput(DOM.hoursWorked);
  if (hoursPerWeek > 0) {
    var weeklyTakehome = results.annualTakehome / 52;
    var hourlyRate     = weeklyTakehome / hoursPerWeek;
    DOM.realHourlyRate.textContent = formatCurrency(hourlyRate) + ' / hr';
    DOM.realHourlyRate.classList.remove('hourly-rate-card__value--empty');
  } else {
    DOM.realHourlyRate.textContent = 'Enter hours above ↑';
    DOM.realHourlyRate.classList.add('hourly-rate-card__value--empty');
  }

  // Zero take-home colour variant
  if (results.annualTakehome === 0) {
    DOM.monthlyTakehome.classList.add('results-hero__amount--zero');
  } else {
    DOM.monthlyTakehome.classList.remove('results-hero__amount--zero');
  }

  // Set date for print header
  document.body.setAttribute('data-report-date', new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  }));

  // Show results card before animating bars
  DOM.resultsCard.removeAttribute('hidden');

  // Animate bars after two animation frames (ensures CSS transition fires)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setBarWidth(DOM.barTakehome, DOM.pctTakehome, results.pctTakehome);
      setBarWidth(DOM.barTax,      DOM.pctTax,      results.pctTax);
      setBarWidth(DOM.barNi,       DOM.pctNi,       results.pctNI);
      setBarWidth(DOM.barExpenses, DOM.pctExpenses,  results.pctExpenses);
    });
  });

  // Populate the calculation steps accordion
  populateBreakdown(results);

  // Scroll to results
  DOM.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* -------------------------------------------------------------------
   Event Handlers
   ------------------------------------------------------------------- */
let hasCalculatedOnce = false;

function handleSubmit(event) {
  event.preventDefault();
  clearError();

  const gross    = parseInput(DOM.grossEarnings);
  const period   = DOM.earningsPeriod.value;
  const mileage  = parseInput(DOM.annualMileage);
  const expenses = parseInput(DOM.otherExpenses);

  const validation = validateInputs(gross, period, mileage, expenses);
  if (!validation.valid) {
    showError(validation.message);
    DOM.grossEarnings.focus();
    return;
  }

  const results = calculateTax(gross, period, mileage, expenses);
  updateResults(results);
  hasCalculatedOnce = true;
}

function handleLiveRecalc() {
  if (!hasCalculatedOnce) return;

  const gross    = parseInput(DOM.grossEarnings);
  const period   = DOM.earningsPeriod.value;
  const mileage  = parseInput(DOM.annualMileage);
  const expenses = parseInput(DOM.otherExpenses);

  const validation = validateInputs(gross, period, mileage, expenses);
  if (!validation.valid) return;

  clearError();
  const results = calculateTax(gross, period, mileage, expenses);
  updateResults(results);
}

/* -------------------------------------------------------------------
   Initialisation
   ------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  cacheDOMElements();

  // Form submit
  DOM.form.addEventListener('submit', handleSubmit);

  // Sanitize, validate styling, and live-recalc for each numeric input
  var numericInputConfigs = [
    { el: DOM.grossEarnings, max: INPUT_LIMITS.earnings.max, decimals: true  },
    { el: DOM.annualMileage,  max: INPUT_LIMITS.mileage.max,  decimals: false },
    { el: DOM.otherExpenses, max: INPUT_LIMITS.expenses.max, decimals: true  },
    { el: DOM.hoursWorked,   max: INPUT_LIMITS.hours.max,    decimals: true  },
  ];

  numericInputConfigs.forEach(function (cfg) {
    cfg.el.addEventListener('input', function () {
      sanitizeNumericInput(cfg.el, cfg.max, cfg.decimals);
      handleLiveRecalc();
    });
    cfg.el.addEventListener('blur', function () {
      cfg.el.classList.add('touched');
    });
  });

  DOM.earningsPeriod.addEventListener('change', handleLiveRecalc);

  // PDF button
  DOM.pdfBtn.addEventListener('click', function () {
    window.print();
  });

  // Tooltips
  initTooltips();
});

/* -------------------------------------------------------------------
   Tooltips — click/tap toggle; :hover also handled via CSS for desktop
   ------------------------------------------------------------------- */
function initTooltips() {
  var btns = document.querySelectorAll('.tooltip-btn');

  btns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var panelId = btn.getAttribute('aria-controls');
      var panel   = document.getElementById(panelId);
      var isOpen  = btn.getAttribute('aria-expanded') === 'true';

      // Close every tooltip first
      btns.forEach(function (b) {
        b.setAttribute('aria-expanded', 'false');
        var p = document.getElementById(b.getAttribute('aria-controls'));
        if (p) p.classList.remove('tooltip-panel--open');
      });

      // Then open this one if it was closed
      if (!isOpen && panel) {
        btn.setAttribute('aria-expanded', 'true');
        panel.classList.add('tooltip-panel--open');
      }
    });
  });

  // Tap anywhere outside closes all tooltips
  document.addEventListener('click', function () {
    btns.forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
      var p = document.getElementById(btn.getAttribute('aria-controls'));
      if (p) p.classList.remove('tooltip-panel--open');
    });
  });
}
