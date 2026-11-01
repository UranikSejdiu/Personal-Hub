import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type Lang = "en";

const DEFAULT_LANG: Lang = "en";

const dict = {
  en: {
    expenseAdded: "Expense added",
    expenseSaved: "Expense updated",
    monthSaved: "Budget saved",
    monthDeleted: "Budget deleted",
    repaymentSaved: "Payment plan saved",
    repaymentDeleted: "Payment plan deleted",
    depositAdded: "Deposit added",
    withdrawalAdded: "Withdrawal added",
    savingsEntryUpdated: "Entry updated",
    savingsEntryDeleted: "Entry deleted",
    yearClosed: "Year closed",
    paymentMarkedPaid: "Marked paid",
    paymentMarkedUnpaid: "Marked unpaid",
    recurringEnabled: "Repeats monthly",
    recurringDisabled: "Monthly repeat removed",
    updateDownloadFailed: "Download failed. Try again.",
    saveAndAddAnother: "Save & add another",
    paymentProgress: "{paid} of {total} paid",
    unpaid: "Unpaid",
    allItems: "All",
    undo: "Undo",
    expenseDeleted: "Expense deleted",
    expenseRestored: "Expense restored",
    restoreExpenseFailed: "Could not restore expense. Try again.",
    suggestionGroceries: "Groceries",
    suggestionTransport: "Transport",
    suggestionBills: "Bills",
    suggestionOther: "Other",
    numberInputInvalid: "Invalid number. The last valid value is kept. Use 1,200.50 or 1.200,50 for grouped amounts.",
    keepEditing: "Keep editing",
    expenseDeleteTitle: "Delete expense?",
    expenseDeleteBody: "Delete “{name}” ({amount}) from this month's budget?",
    savingsAllYears: "All years",
    savingsYear: "Year",
    savingsProtected: "Protected opening balance",
    savingsClosePrior: "Close prior year",
    savingsCloseHelp: "Carry the closing balance into an opening balance for the next year. Opening balance entries are protected.",
    planFirstMonth: "First month",
    editPaymentPlan: "Edit payment plan",
    paymentPlanEdit: "Edit {name}",
    planDiscardHelp: "Your changes to this payment plan have not been saved.",
    planLastMonth: "Last",
    navDashboard: "Months",
    navSavings: "Savings",
    navLoans: "Payments",
    navSettings: "Settings",

    dashboardTitle: "Monthly budget",
    dashboardSubtitle: "Income, expenses and savings.",
    dashboardCurrentMonth: "Current month",
    dashboardOtherMonths: "Previous months",
    dashboardActualRemaining: "Current remaining",
    dashboardPlannedRemaining: "Planned remaining",
    dashboardPaidOutflow: "Paid so far",
    dashboardPlannedOutflow: "Outgoings",
    dashboardSavingsTarget: "Savings target · {amount}",
    dashboardTargetMet: "Target met",
    dashboardTargetProgress: "In progress",
    dashboardOpenBudget: "Open budget",
    monthSubtitle: "Expenses and repayments.",
    monthPayments: "Loan & card payments",
    expenseTapToEdit: "Tap to edit",
    expenseRecurring: "Recurring",
    expenseName: "Expense",
    expenseEdit: "Edit expense",
    expenseInvalid: "Enter an expense name and a valid, non-negative amount.",
    expenseDiscard: "Your changes to this expense have not been saved.",
    copyPreviousConfirm: "Copy missing expenses from {month}? Your existing expenses are kept, and copied expenses start unpaid.",
    monthlyDetails: "Detailed breakdown",
    savingsTotal: "Total savings",
    savingsSubtitle: "Balance and activity.",
    loansSubtitle: "Your repayment plans.",
    dashboardSavingsProgress: "Monthly savings target",
    dashboardNoCurrentMonth: "Plan this month",
    dashboardNoCurrentMonthHint: "Create your budget for {month} to track income and expenses.",
    dashboardCreateCurrentMonth: "Create this month",
    dashboardNextMonth: "Next month",
    monthAlreadyExists: "This month already exists. Open it from Dashboard to edit its values.",
    monthCreateTitle: "New month",
    monthEditTitle: "Edit month",
    monthEditValues: "Income & savings target",
    monthDefaultsHelp: "These values are remembered for new months until you change them. Other saved months keep their own income and savings target.",
    monthAmountsInvalid: "Enter valid, non-negative amounts with up to two decimal places.",
    monthDiscardHelp: "Your changes to this month have not been saved.",
    dashboardMonthOptions: "Options for {month}",
    dashboardOpenMonth: "Open budget for {month}",
    loading: "Loading…",
    retry: "Retry",
    dbInitFailed: "Failed to initialize database.",
    incomeColon: "Income:",
    deleteMonthConfirm: "Delete budget for {month}?",
    newBudgetCreated: "Budget created for {month}",
    tabLoans: "Repayments",
    tabSavings: "Savings",
    saveFailed: "Failed to save.",
    errorLoadingData: "Failed to load data.",
    errorDeletingBudget: "Failed to delete budget.",
    errorUpdatingExpense: "Failed to update expense.",
    errorRemovingExpense: "Failed to remove expense.",
    errorUpdatingLoan: "Failed to update loan.",

    paid: "Paid off",
    monthlyPayment: "Monthly Payment",

    sectionExpenses: "Expenses",
    addRow: "Add expense",
    addCategoryPlaceholder: "Add category…",
    category: "Category",
    copyFromPreviousMonth: "Copy from previous month",
    copiedFromPreviousMonth: "Copied data from {month}",
    noPreviousMonthFound: "No previous budget found",
    recurringToggle: "Recurring",
    expenseOptions: "Options for {category}",
    expenseAmount: "Amount",
    expenseEditAmount: "Edit amount for {category}",

    sectionSummary: "Month summary",
    monthlyIncome: "Monthly Income (after tax)",
    planned: "Planned",
    actualLabel: "Actual",
    loanPaymentLabel: "Loan Payment",
    ccPaymentLabel: "Credit Card Payment",
    totalCustomExpenses: "Total Custom Expenses",
    totalMonthlyOutflow: "TOTAL MONTHLY OUTFLOW",
    remainingSavings: "REMAINDER / SAVINGS",
    save: "Save",
    loanSection: "Loan",
    addLoanPlan: "Add loan",
    addCardInstallment: "Add card",
    paymentPlanName: "Name",
    paymentPlanNamePlaceholder: "e.g. Car loan or phone payment",
    paymentPlanTotal: "Total amount (€)",
    paymentPlanCount: "Number of monthly payments",
    paymentLimitOptional: "Payment limit (optional)",
    paymentPlanFirstMonth: "First payment month",
    paymentPlanLoanHint: "Enter a monthly payment, or an amount and interest rate to calculate one.",
    paymentPlanCardHint: "Each installment is tracked separately and split evenly over the payment months.",
    paymentPlanInvalid: "Enter a name and a valid payment schedule.",
    paymentPlanDeleteTitle: "Delete payment plan?",
    paymentPlanDeleteMessage: "This removes the plan and its recorded monthly payments.",
    paymentPlanEmpty: "No loans or card payments yet.",
    paymentPlanSaveFailed: "Could not save the payment plan.",
    paymentPlanDeleteFailed: "Could not delete the payment plan.",
    edit: "Edit",
    noEndMonth: "No end month",
    paymentsAlreadyMade: "Payments already made",
    loanPaidOfTotal: "{paid} of {total} paid",
    perMonth: "/ month",
    lastPaymentMonth: "Last payment month",
    paymentsAlreadyMadeHint: "Count payments already made, including those before you started using the app.",
    paymentsRemaining: "{count} payments remaining",
    paymentsRecorded: "{count} payments recorded",
    loanAmount: "Loan Amount (€)",
    loanRate: "Interest Rate (%/yr)",
    ccSection: "Credit Card",
    secondCreditCard: "Second Credit Card",
    creditCardPaymentFor: "{name} monthly payment",
    previousYear: "Previous year",
    nextYear: "Next year",
    previousMonth: "Previous month",
    nextMonth: "Next month",

    deleteConfirmTitle: "Delete",
    delete: "Delete",
    confirm: "Confirm",
    savingsGoalLabel: "Monthly Savings Target",
    goalMetBadge: "Target met",
    savingsBalanceLabel: "Balance",
    savingsNewEntry: "Add entry",
    savingsEditEntry: "Edit Entry",
    savingsEntryType: "Type",
    savingsTypeDeposit: "Deposit",
    savingsTypePurchase: "Withdraw",
    savingsDescriptionLabel: "Description (optional)",
    savingsAmountLabel: "Amount (€)",
    savingsDateLabel: "Date",
    savingsNoEntries: "No entries yet.",
    savingsNoEntriesHint: "Use Deposit or Withdraw to add an entry.",
    savingsAutoBadge: "Auto",
    savingsAutoEditTitle: "Edit Auto Deposit",
    savingsAutoDescriptionLabel: "Description (optional)",
    activityLabel: "Savings activity",
    closeYearLabel: "Close year",
    closeYearConfirm: "Close {year}? Net savings: {amount}. A carry-forward entry will be created in {nextYear}.",
    closingBalance: "Closing balance {year}",
    closeYearBlocked: "Close {year} first — it still has open activity.",
    closeYearNothing: "Nothing to close for {year}.",
    deleteSavingsEntryConfirm: "Delete this entry?",
    savingsErrorAmount: "Please enter an amount greater than zero.",
    savingsErrorDate: "Please select a date.",
    errorAddingSavings: "Failed to add entry.",
    errorUpdatingSavings: "Failed to update entry.",
    errorDeletingSavings: "Failed to delete entry.",

    transaction: "Transaction",
    totalSaved: "Total Saved",
    totalSpent: "Total Spent",

    checkForUpdates: "Check for updates",
    checkingForUpdates: "Checking for updates...",
    updatesTitle: "Updates",
    currentVersion: "Current version",
    updateAvailable: "Update available",
    updateAvailableToast: "New version {version} is available.",
    updateUpToDate: "You're up to date",
    updateCheckFailed: "Failed to check for updates",
    updateNoReleases: "No installable release is available yet",
    updateCachedWarning: "Could not check now. Showing the update found during the last successful check.",
    updateLastChecked: "Last successful check: {time}",
    changelog: "Changelog",
    newVersionReady: "New version {version} is ready to install.",
    downloadAndInstall: "Download & Install",
    installNow: "Install now",
    updateInstallerOpened: "Update installer opened",
    downloadingUpdate: "Downloading... {percent}%",
    updateInstallFailed: "Could not open the update installer.",
    updateInstallSettingsHint: "If Android blocked the installer, check the install permission for this app.",
    updateAllowInstalls: "Open install settings",
    updateDownloadAgain: "Download again",
    discardChangesTitle: "Discard changes?",
    discard: "Discard changes",
    expand: "Expand",
    collapse: "Collapse",
    cancel: "Cancel",
    exitTitle: "Exit app?",
    exitMessage: "Are you sure you want to leave the app?",
    exitApp: "Exit",
    clear: "Clear",

    msJan: "Jan",
    msFeb: "Feb",
    msMar: "Mar",
    msApr: "Apr",
    msMay: "May",
    msJun: "Jun",
    msJul: "Jul",
    msAug: "Aug",
    msSep: "Sep",
    msOct: "Oct",
    msNov: "Nov",
    msDec: "Dec",
  },
} as const;

export type TKey = keyof (typeof dict)["en"];

const MONTHS_SHORT = [
  "msJan",
  "msFeb",
  "msMar",
  "msApr",
  "msMay",
  "msJun",
  "msJul",
  "msAug",
  "msSep",
  "msOct",
  "msNov",
  "msDec",
] as const;

export function monthLabelShort(_lang: Lang, key: string): string {
  const month = Number(key.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return key;
  const year = key.slice(0, 4);
  return `${dict.en[MONTHS_SHORT[month - 1]]} ${year}`;
}

export function monthLabelFull(_lang: Lang, key: string): string {
  const month = Number(key.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return key;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[month - 1]} ${key.slice(0, 4)}`;
}

interface I18nContextValue {
  lang: Lang;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>): string => {
      let text: string = dict.en[key];
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    []
  );

  const value = useMemo(
    () => ({ lang: DEFAULT_LANG, t }),
    [t]
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider.");
  return ctx;
}
