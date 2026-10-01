/**
 * A single item on a professional's service catalogue.
 *
 * LIVES HERE, NOT IN `ServiceCatalogPicker.tsx`.
 *
 * `ServiceCatalogPicker` renders nothing anywhere in the SPA -- a repo-wide grep
 * for the component returned only its own definition, because
 * `PaymentSchedule.tsx` imports the `ServiceItem` TYPE from that file and never
 * the component. So the file looked dead by a 1-hit grep, and deleting it would
 * have broken the build.
 *
 * The type outlives the component, so it was moved here and the component
 * deleted. Keeping a type in a file named for a component that no longer exists
 * is how the next person repeats the same grep and reaches the same wrong
 * conclusion.
 */
export interface ServiceItem {
    title: string;
    price: number | string;
    description?: string;
}
