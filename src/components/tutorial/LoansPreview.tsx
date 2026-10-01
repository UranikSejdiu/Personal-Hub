import { View } from "react-native";
import { LoanPaymentSection } from "../LoanPaymentSection";
import { CreditCardSection } from "../CreditCardSection";
import { currentSampleMonth, sampleBudget, SAMPLE_LOANS } from "../../lib/sampleDataset";
import { CREDIT_CARD_SLOTS, creditCardDetails } from "../../lib/creditCards";

/**
 * Renders the real loan and credit card sections from the sample dataset, so the
 * instalments, progress and payoff months are the app's own calculations rather
 * than a hand-drawn imitation.
 */
export function LoansPreview() {
  const month = currentSampleMonth();
  const budget = sampleBudget(month, 1, "");

  return (
    <View className="w-full gap-3 px-1">
      <LoanPaymentSection budget={budget} loans={SAMPLE_LOANS} onToggle={() => {}} />
      {CREDIT_CARD_SLOTS.map((slot) => (
        <CreditCardSection key={slot} slot={slot} card={creditCardDetails(SAMPLE_LOANS, slot)} month={budget.month} paid={slot === 1 ? budget.cc_paid : budget.cc2_paid} onToggle={() => {}} />
      ))}
    </View>
  );
}
