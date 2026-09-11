import { redirect } from 'next/navigation';

// The directory lives as a tab on /validators (phase 15 placement decision).
export default function OperatorsIndex() {
  redirect('/validators?tab=operators');
}
