import { View } from "react-native";
import { RepaymentPlanCard } from "../RepaymentPlanCard";
import { SAMPLE_LOANS } from "../../lib/sampleDataset";
import { loanMonthlyPayment } from "../../lib/budget";
import { creditCardDetails, creditCardScheduledMonths } from "../../lib/creditCards";

export function LoansPreview() {
  const card = creditCardDetails(SAMPLE_LOANS, 1);

  return (
    <View className="w-full gap-3 px-1">
      <RepaymentPlanCard info={{ kind: "loan", name: SAMPLE_LOANS.loan_name, payment: loanMonthlyPayment(SAMPLE_LOANS), monthsPaid: SAMPLE_LOANS.loan_months_paid, term: SAMPLE_LOANS.loan_term, startMonth: SAMPLE_LOANS.loan_start_month, endMonth: SAMPLE_LOANS.loan_end_month }} />
      <RepaymentPlanCard info={{ kind: "card", name: card.name, payment: card.payment, monthsPaid: card.monthsPaid, term: creditCardScheduledMonths(card) ?? 0, startMonth: card.startMonth, endMonth: card.endMonth }} />
    </View>
  );
}
