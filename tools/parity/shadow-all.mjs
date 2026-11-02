#!/usr/bin/env node
/**
 * shadow-all.mjs — the gate's shadow pass.
 *
 * WHAT IT DOES
 * ------------
 * For every route the gateway actually SERVES (rather than stubs), it starts the
 * gateway against the ETL'd PostgreSQL database, sends the same request to
 * Laravel and to Go, and requires the answers to be identical byte for byte.
 *
 * WHY IT BELONGS IN THE GATE
 * --------------------------
 * A handler that matched once is not a handler that matches. The endpoint's
 * correctness depends on the schema, on the ETL, on the authentication and on
 * the encoder — four things that change independently. `php scripts/verify.php`
 * already rebuilds the schema and re-runs the ETL, so this is the step that says
 * whether all of that still adds up to the same BYTES.
 *
 * THE LIST OF PORTED ROUTES IS EXPLICIT. It grows one entry at a time, and an
 * entry that stops matching fails the gate. A route is added here only when its
 * handler is written.
 *
 * USAGE (the gate passes the environment; by hand:)
 *   node tools/parity/shadow-all.mjs
 *   node tools/parity/shadow-all.mjs --laravel=http://127.0.0.1:9001
 */

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { shadowRoute } from './shadow-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const laravel = arg('laravel', process.env.SHADOW_LARAVEL ?? 'http://127.0.0.1:9001');
const port = arg('port', '8098');
const php = process.env.PHP_BIN ?? 'php';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/4ceria_pgcheck';
// The owner store. CI exports MYSQL_DSN with its own credentials; the
// default matches a local Laragon install (no root password).
const mysqlDsn = process.env.MYSQL_DSN ?? 'root@tcp(127.0.0.1:3306)/4ceria?parseTime=true';

/**
 * THE PORTED ROUTES.
 *
 * Each entry names the route id from `routing/routes.yaml` and the token role it
 * needs. A parameterised route also names a concrete URI, with an id that must
 * exist in both databases.
 */
const PORTED = [
    { id: 'get.api.admin.stats', role: 'admin' },
    { id: 'get.api.admin.houses', role: 'admin' },
    // Marketplace: the caller has no quotes in the fixture, and the empty
    // store body is a deterministic 422.
    { id: 'get.api.material-quotes', role: 'user' },
    { id: 'post.api.material-quotes', role: 'user', method: 'POST', note: 'empty body', uri: 'api/material-quotes', body: {} },
    { id: 'material-orders.index', role: 'user' },
    { id: 'get.api.suppliers.supplier.reviews', role: 'user', uri: 'api/suppliers/1093/reviews' },
    // Logistics: every route gates on role_type === 'logistics', which no
    // gate fixture holds — the deterministic answer is the 403.
    { id: 'get.api.logistics.available-jobs', role: 'user' },
    { id: 'get.api.logistics.dashboard-stats', role: 'user' },
    { id: 'get.api.logistics.my-jobs', role: 'user' },
    { id: 'post.api.logistics.jobs.id.accept', role: 'user', method: 'POST', note: 'not logistics', uri: 'api/logistics/jobs/1/accept', body: {} },
    { id: 'post.api.logistics.jobs.id.status', role: 'user', method: 'POST', note: 'not logistics', uri: 'api/logistics/jobs/1/status', body: { status: 'accepted' } },
    // House writes need a house row the fixture does not have; the empty
    // store body is the one deterministic answer.
    { id: 'houses.store', role: 'user', method: 'POST', note: 'empty body', uri: 'api/houses', body: {} },
    // Firm members: the fixture owns no roster rows, so both the empty reads
    // and the refusals are deterministic. The FormRequest 403s carry a local
    // debug trace and stay out (Pest asserts their status + message).
    { id: 'get.api.firm-members.roster', role: 'user' },
    { id: 'get.api.firm-members.roster', role: 'arsitek', note: 'firm owner, empty roster' },
    { id: 'get.api.firm-members.invitations', role: 'user' },
    { id: 'get.api.firm-members.my-firms', role: 'user' },
    { id: 'get.api.firm-members.suggestions', role: 'arsitek' },
    { id: 'get.api.firm-members.browse-owners', role: 'user' },
    { id: 'get.api.firm-members.profile.ownerId', role: 'user', uri: 'api/firm-members/profile/31682' },
    { id: 'post.api.firm-members.search', role: 'arsitek', method: 'POST', note: 'min length', uri: 'api/firm-members/search', body: { query: 'a' } },
    { id: 'post.api.firm-members.search', role: 'arsitek', method: 'POST', note: 'self excluded', uri: 'api/firm-members/search', body: { query: 'Giska' } },
    { id: 'post.api.firm-members.request-join', role: 'user', method: 'POST', note: 'empty body', uri: 'api/firm-members/request-join', body: {} },
    { id: 'post.api.firm-members.quick-assign', role: 'user', method: 'POST', note: 'empty body', uri: 'api/firm-members/quick-assign', body: {} },
    { id: 'post.api.firm-members.update-profile', role: 'user', method: 'POST', note: 'not a firm owner', uri: 'api/firm-members/update-profile', body: {} },
    // Team members: the fixture owns no rows, so the empty list and the two
    // role refusals are deterministic. PUT/DELETE of a missing id carries a
    // binding trace and stays out.
    { id: 'get.api.team-members', role: 'user' },
    { id: 'get.api.team-members', role: 'arsitek', note: 'empty active roster' },
    { id: 'post.api.team-members', role: 'user', method: 'POST', note: 'role refused', uri: 'api/team-members', body: {} },
    { id: 'post.api.team-members', role: 'arsitek', method: 'POST', note: 'empty body', uri: 'api/team-members', body: {} },
    // Portfolios: the fixture owns no rows; the index without user_id is the
    // controller's own 400 and the empty list is a bare [].
    { id: 'get.api.portfolios', role: 'user', note: 'no user_id', uri: 'api/portfolios' },
    { id: 'get.api.portfolios', role: 'user', note: 'empty list', uri: 'api/portfolios?user_id=31682' },
    { id: 'post.api.portfolios', role: 'user', method: 'POST', note: 'empty body', uri: 'api/portfolios', body: {} },
    { id: 'post.api.portfolios', role: 'user', method: 'POST', note: 'bad role_type', uri: 'api/portfolios', body: { role_type: 'chef', title: 'x', description: 'y' } },
    // Favorites: an empty account answers [] for both keys; the orphan toggle
    // is the controller's own 404.
    { id: 'get.api.favorites', role: 'user' },
    { id: 'post.api.favorites.toggle', role: 'user', method: 'POST', note: 'empty body', uri: 'api/favorites/toggle', body: {} },
    { id: 'post.api.favorites.toggle', role: 'user', method: 'POST', note: 'bad type', uri: 'api/favorites/toggle', body: { favoritable_type: 'chef', favoritable_id: 1 } },
    { id: 'post.api.favorites.toggle', role: 'user', method: 'POST', note: 'orphan target', uri: 'api/favorites/toggle', body: { favoritable_type: 'house', favoritable_id: 999999999 } },
    { id: 'post.api.favorites.merge', role: 'user', method: 'POST', note: 'empty body', uri: 'api/favorites/merge', body: {} },
    { id: 'post.api.favorites.merge', role: 'user', method: 'POST', note: 'bad item', uri: 'api/favorites/merge', body: { items: [{ type: 'chef', id: 0 }] } },
    // Chat: the fixture owns no threads; the inbox is empty and the store's
    // refusals are deterministic (self, staff, validation).
    { id: 'get.api.conversations', role: 'user' },
    { id: 'post.api.conversations', role: 'user', method: 'POST', note: 'empty body', uri: 'api/conversations', body: {} },
    { id: 'post.api.conversations', role: 'user', method: 'POST', note: 'self', uri: 'api/conversations', body: { user_id: 31692 } },
    { id: 'post.api.conversations', role: 'user', method: 'POST', note: 'staff', uri: 'api/conversations', body: { user_id: 31694 } },
    { id: 'post.api.conversations', role: 'user', method: 'POST', note: 'unknown user', uri: 'api/conversations', body: { user_id: 999999999 } },
    // Web push: no VAPID key is configured locally (501), and both bodies
    // require an endpoint. The SSRF refusals carry a trace and stay out.
    { id: 'get.api.push.public-key', role: 'user' },
    { id: 'post.api.push.subscribe', role: 'user', method: 'POST', note: 'empty body', uri: 'api/push/subscribe', body: {} },
    { id: 'post.api.push.unsubscribe', role: 'user', method: 'POST', note: 'empty body', uri: 'api/push/unsubscribe', body: {} },
    { id: 'post.api.push.subscribe', role: 'user', method: 'POST', note: 'http endpoint', uri: 'api/push/subscribe', body: { endpoint: 'http://fcm.googleapis.com/x', keys: { p256dh: 'k', auth: 'a' } } },
    // Merchant: the plainuser fixture (akmal) owns the supplier row, so the
    // catalogue is a deterministic 200 while the profile role gate is a 403.
    { id: 'get.api.merchant.profile', role: 'plainuser' },
    { id: 'put.api.merchant.profile', role: 'plainuser', method: 'PUT', note: 'not a supplier', uri: 'api/merchant/profile', body: {} },
    { id: 'get.api.merchant.materials', role: 'plainuser' },
    // Materials writes validate with a BARE errors envelope; the fixture
    // material 272 belongs to the same supplier, so a bad is_available is a
    // deterministic 422 with no mutation.
    { id: 'materials.store', role: 'plainuser', method: 'POST', note: 'empty body', uri: 'api/merchant/materials', body: {} },
    { id: 'materials.store', role: 'plainuser', method: 'POST', note: 'partial body', uri: 'api/merchant/materials', body: { name: 'x' } },
    { id: 'materials.update', role: 'plainuser', method: 'PUT', note: 'bad boolean', uri: 'api/merchant/materials/272', body: { is_available: 'x' } },
    // Marketplace: public reads over the fixture supplier/material pair; the
    // listing's same-second ties come back id DESCENDING for this query.
    { id: 'get.api.marketplace.suppliers', role: 'user' },
    { id: 'get.api.marketplace.suppliers', role: 'user', note: 'search', uri: 'api/marketplace/suppliers?search=Akmal' },
    { id: 'get.api.marketplace.suppliers.id', role: 'user', uri: 'api/marketplace/suppliers/1093' },
    { id: 'get.api.marketplace.materials', role: 'user' },
    { id: 'get.api.marketplace.materials', role: 'user', note: 'search', uri: 'api/marketplace/materials?search=Sofa' },
    // Consultations: an empty board and the WIB-wall-clock refusals.
    { id: 'get.api.consultations', role: 'user' },
    { id: 'post.api.consultations', role: 'user', method: 'POST', note: 'empty body', uri: 'api/consultations', body: {} },
    { id: 'post.api.consultations', role: 'user', method: 'POST', note: 'past date', uri: 'api/consultations', body: { notaris_id: 564, schedule_date: '2020-01-01T10:00' } },
    { id: 'post.api.consultations', role: 'user', method: 'POST', note: 'invalid date', uri: 'api/consultations', body: { notaris_id: 564, schedule_date: 'not-a-date' } },
    // The remaining singles: the public brief\u2019s revocation path, the
    // subspecialty lookup, both my-bids branches, the hire history, the
    // supplier-only delivery list (403 for a non-supplier), the verification
    // guardrails (bad type/field, empty field, missing vault signer, stranger)
    // and the upload validator. Creating answers and deleting rooms need
    // fixture rows, so the live proofs cover those instead.
    { id: 'get.api.brief.token', role: null, note: 'revoked token', uri: 'api/brief/revoked-token-xyz' },
    { id: 'get.api.contractor-subspecialties', role: 'user' },
    { id: 'get.api.my-bids', role: 'arsitek' },
    { id: 'get.api.my-bids', role: 'plainuser', note: 'no profile' },
    { id: 'get.api.hire-history', role: 'user' },
    { id: 'get.api.delivery-jobs', role: 'plainuser', note: 'supplier-only' },
    { id: 'get.api.verifications.documents.type.id.field', role: 'user', note: 'bad type', uri: 'api/verifications/documents/bogus/6634/foto' },
    { id: 'get.api.verifications.documents.type.id.field', role: 'user', note: 'bad field', uri: 'api/verifications/documents/arsitek/6634/password' },
    { id: 'get.api.verifications.documents.type.id.field', role: 'user', note: 'empty field', uri: 'api/verifications/documents/arsitek/6634/npwp' },
    { id: 'get.api.verifications.documents.type.id.field', role: 'user', note: 'presign unavailable', uri: 'api/verifications/documents/arsitek/6634/foto' },
    { id: 'get.api.verifications.documents.type.id.field', role: 'plainuser', note: 'stranger forbidden', uri: 'api/verifications/documents/arsitek/6634/foto' },
    { id: 'post.api.upload', role: 'user', method: 'POST', note: 'missing file', uri: 'api/upload', body: {} },
    { id: 'post.api.upload', role: 'user', method: 'POST', note: 'non-file', uri: 'api/upload', body: { file: 'abc' } },
    // Project detail — ported but previously ungated because no stable id
    // existed. The 14976 fixture is stable now, and this entry already caught
    // a numeric-rendering regression (`0` vs `0.00`) in its requirements.
    { id: 'get.api.projects.project', role: 'user', uri: 'api/projects/14976' },
    { id: 'get.api.projects.project', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976' },
    // Phase brief lifecycle: the deterministic guards (state, ownership,
    // validation). The 200s mutate the pinned project and stay in the live
    // proofs with restore.
    { id: 'post.api.projects.project.approve-construction-brief', role: 'user', method: 'POST', note: 'not pending', uri: 'api/projects/14976/approve-construction-brief', body: {} },
    { id: 'post.api.projects.project.approve-construction-brief', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/approve-construction-brief', body: {} },
    { id: 'post.api.projects.project.revise-construction-brief', role: 'user', method: 'POST', note: 'missing notes', uri: 'api/projects/14976/revise-construction-brief', body: {} },
    { id: 'post.api.projects.project.revise-construction-brief', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/revise-construction-brief', body: { notes: 'x' } },
    { id: 'post.api.projects.project.lock-brief', role: 'user', method: 'POST', note: 'not the architect', uri: 'api/projects/14976/lock-brief', body: { phase: 'design' } },
    { id: 'post.api.projects.project.lock-brief', role: 'user', method: 'POST', note: 'bad phase', uri: 'api/projects/14976/lock-brief', body: { phase: 'bogus' } },
    { id: 'post.api.projects.project.kickoff', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/kickoff', body: { role: 'arsitek' } },
    { id: 'post.api.projects.project.kickoff', role: 'user', method: 'POST', note: 'missing role', uri: 'api/projects/14976/kickoff', body: {} },
    { id: 'post.api.projects.project.kickoff', role: 'user', method: 'POST', note: 'bad role', uri: 'api/projects/14976/kickoff', body: { role: 'bogus' } },
    { id: 'post.api.projects.project.review', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/review', body: { rating: 5, target_role: 'arsitek' } },
    { id: 'post.api.projects.project.review', role: 'user', method: 'POST', note: 'missing fields', uri: 'api/projects/14976/review', body: {} },
    { id: 'post.api.projects.project.review', role: 'user', method: 'POST', note: 'no assignment', uri: 'api/projects/14976/review', body: { rating: 5, target_role: 'arsitek' } },
    { id: 'post.api.projects.project.review', role: 'user', method: 'POST', note: 'rating too high', uri: 'api/projects/14976/review', body: { rating: 9, target_role: 'arsitek' } },
    { id: 'post.api.projects.project.review', role: 'user', method: 'POST', note: 'rating not integer', uri: 'api/projects/14976/review', body: { rating: 'abc', target_role: 'arsitek' } },
    // Payment termin writes: the binding/auth/validation guards. 900021255
    // is the pinned arsitek stage (locked, recipient NULL). Mutating 200s
    // stay in the live proofs with restore.
    { id: 'put.api.projects.project.payment-termins.termin', role: 'plainuser', method: 'PUT', note: 'stranger forbidden', uri: 'api/projects/14976/payment-termins/900021255', body: { label: 'X' } },
    { id: 'put.api.projects.project.payment-termins.termin', role: 'user', method: 'PUT', note: 'bad status', uri: 'api/projects/14976/payment-termins/900021255', body: { status: 'bogus' } },
    { id: 'put.api.projects.project.payment-termins.termin', role: 'user', method: 'PUT', note: 'bad amount', uri: 'api/projects/14976/payment-termins/900021255', body: { amount: 'abc' } },
    { id: 'put.api.projects.project.payment-termins.termin', role: 'user', method: 'PUT', note: 'percentage over', uri: 'api/projects/14976/payment-termins/900021255', body: { percentage: 150 } },
    { id: 'put.api.projects.project.payment-termins.termin', role: 'user', method: 'PUT', note: 'foreign milestone', uri: 'api/projects/14976/payment-termins/900021255', body: { milestone_id: 999999999 } },
    { id: 'delete.api.projects.project.payment-termins.termin', role: 'plainuser', method: 'DELETE', note: 'stranger forbidden', uri: 'api/projects/14976/payment-termins/900021255' },
    { id: 'post.api.projects.project.payment-termins.termin.link-milestone', role: 'user', method: 'POST', note: 'owner is not the recipient', uri: 'api/projects/14976/payment-termins/900021255/link-milestone', body: { milestone_id: 999999999 } },
    { id: 'post.api.projects.project.payment-termins.termin.unlink-milestone', role: 'user', method: 'POST', note: 'owner is not the recipient', uri: 'api/projects/14976/payment-termins/900021255/unlink-milestone', body: {} },
    // Mutual termination: the empty board and the initiate validator. The
    // abort-backed 403s and binding 404s carry debug traces locally and stay
    // out; their statuses are asserted by Pest.
    { id: 'get.api.projects.project.mutual-termination', role: 'user', uri: 'api/projects/14976/mutual-termination' },
    { id: 'post.api.projects.project.mutual-termination.initiate', role: 'user', method: 'POST', note: 'missing reason', uri: 'api/projects/14976/mutual-termination/initiate', body: {} },
    { id: 'post.api.projects.project.mutual-termination.initiate', role: 'user', method: 'POST', note: 'non-string reason', uri: 'api/projects/14976/mutual-termination/initiate', body: { reason: 5 } },
    { id: 'post.api.projects.project.mutual-termination.initiate', role: 'user', method: 'POST', note: 'non-string settlement', uri: 'api/projects/14976/mutual-termination/initiate', body: { reason: 'x', settlement_terms: 5 } },
    // Engineering / specialist workflow: validation, the owner-or-PM
    // lifecycle gate, the participant gate for asking/declining, the plain
    // "Bid not found." 404, and the architect-only interview. 935 is the
    // pinned pending addendum on 14975. Mutating 200s stay in live proofs.
    { id: 'post.api.projects.project.request-engineering', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/request-engineering', body: {} },
    { id: 'post.api.projects.project.request-engineering', role: 'user', method: 'POST', note: 'bad role', uri: 'api/projects/14976/request-engineering', body: { role_type: 'bogus', description: 'x' } },
    { id: 'post.api.projects.project.request-engineering', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/request-engineering', body: { role_type: 'structural', description: 'x' } },
    { id: 'post.api.projects.project.verify-engineering.addendum', role: 'user', method: 'POST', note: 'bad status', uri: 'api/projects/14975/verify-engineering/935', body: { status: 'bogus' } },
    { id: 'post.api.projects.project.verify-engineering.addendum', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/verify-engineering/935', body: { status: 'approved' } },
    { id: 'post.api.projects.project.approve-engineering-hire.addendum', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/approve-engineering-hire/935', body: {} },
    { id: 'post.api.projects.project.reject-engineering-hire.addendum', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/reject-engineering-hire/935', body: {} },
    { id: 'post.api.projects.project.approve-engineering', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/approve-engineering', body: {} },
    { id: 'post.api.projects.project.approve-engineering', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/approve-engineering', body: { role_type: 'structural' } },
    { id: 'post.api.projects.project.authorize-specialist', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/authorize-specialist', body: {} },
    { id: 'post.api.projects.project.authorize-specialist', role: 'user', method: 'POST', note: 'missing addendum', uri: 'api/projects/14975/authorize-specialist', body: { role_type: 'structural', addendum_id: 999999999 } },
    { id: 'post.api.projects.project.authorize-specialist', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/authorize-specialist', body: { role_type: 'structural', addendum_id: 935 } },
    { id: 'post.api.projects.project.reject-specialist', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/reject-specialist', body: {} },
    { id: 'post.api.projects.project.reject-specialist', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/reject-specialist', body: { role_type: 'structural', addendum_id: 935 } },
    { id: 'post.api.projects.project.reject-engineering-bid.bidId', role: 'user', method: 'POST', note: 'bid not found', uri: 'api/projects/14975/reject-engineering-bid/999999999', body: { bid_type: 'structural' } },
    { id: 'post.api.projects.project.reject-engineering-bid.bidId', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/reject-engineering-bid/999999999', body: { bid_type: 'structural' } },
    { id: 'post.api.projects.project.reject-engineering-bid.bidId', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/reject-engineering-bid/999999999', body: {} },
    { id: 'post.api.projects.project.submit-engineering-interview', role: 'user', method: 'POST', note: 'not the architect', uri: 'api/projects/14976/submit-engineering-interview', body: {} },
    // Shortlist: the two 403 tiers (participant, PM-managed project) and
    // the validation/state guards on the PM-free 14975. Mutating 200s stay
    // in the live proof with restore.
    { id: 'post.api.projects.project.shortlist-bid', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/shortlist-bid', body: { bid_id: 2587, bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.shortlist-bid', role: 'user', method: 'POST', note: 'PM-managed', uri: 'api/projects/14976/shortlist-bid', body: { bid_id: 2587, bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.shortlist-bid', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/shortlist-bid', body: {} },
    { id: 'post.api.projects.project.shortlist-bid', role: 'user', method: 'POST', note: 'bad type', uri: 'api/projects/14975/shortlist-bid', body: { bid_id: 1, bid_type: 'bogus' } },
    { id: 'post.api.projects.project.shortlist-bid', role: 'user', method: 'POST', note: 'accepted bid', uri: 'api/projects/14975/shortlist-bid', body: { bid_id: 97, bid_type: 'notaris' } },
    { id: 'post.api.projects.project.shortlist-bid', role: 'pm', method: 'POST', note: 'empty body', uri: 'api/projects/14975/shortlist-bid', body: {} },
    // Termination: owner-only firing, the finished-project guard (14971 is
    // giska's), the role/no-professional validation, and the resignation side
    // (finished-project guard, non-hired 403, reason required). 14975 has the
    // notaris hired and the PM-free 14976 has nobody. Success 200s settle
    // bids/termins/notifications and stay in the live proofs with restore.
    { id: 'post.api.projects.project.terminate', role: 'plainuser', method: 'POST', note: 'owner only', uri: 'api/projects/14975/terminate', body: { role_type: 'notaris', reason: 'x' } },
    { id: 'post.api.projects.project.terminate', role: 'arsitek', method: 'POST', note: 'completed project', uri: 'api/projects/14971/terminate', body: { role_type: 'arsitek', reason: 'x' } },
    { id: 'post.api.projects.project.terminate', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/terminate', body: {} },
    { id: 'post.api.projects.project.terminate', role: 'user', method: 'POST', note: 'no professional', uri: 'api/projects/14975/terminate', body: { role_type: 'arsitek', reason: 'x' } },
    { id: 'post.api.projects.project.terminate', role: 'user', method: 'POST', note: 'bad role', uri: 'api/projects/14975/terminate', body: { role_type: 'bogus', reason: 'x' } },
    { id: 'post.api.projects.project.resign', role: 'arsitek', method: 'POST', note: 'completed project', uri: 'api/projects/14971/resign', body: { reason: 'x' } },
    { id: 'post.api.projects.project.resign', role: 'user', method: 'POST', note: 'not hired', uri: 'api/projects/14976/resign', body: { reason: 'x' } },
    { id: 'post.api.projects.project.resign', role: 'arsitek', method: 'POST', note: 'not hired', uri: 'api/projects/14975/resign', body: { reason: 'x' } },
    { id: 'post.api.projects.project.resign', role: 'notaris', method: 'POST', note: 'missing reason', uri: 'api/projects/14975/resign', body: {} },
    // Propose fee: validation, the percentage split, the PM fee-structure
    // rule, the bid-owner gate, the status guard and the plain 404. Mutating
    // 200s stay in the live proof with restore.
    { id: 'post.api.projects.project.propose-fee', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/propose-fee', body: {} },
    { id: 'post.api.projects.project.propose-fee', role: 'plainuser', method: 'POST', note: 'not the bidder', uri: 'api/projects/14976/propose-fee', body: { bid_id: 2587, bid_type: 'arsitek', price: 5000000, proposed_termins: [{ percentage: 100, trigger_description: 'Done' }] } },
    { id: 'post.api.projects.project.propose-fee', role: 'user', method: 'POST', note: 'split not 100', uri: 'api/projects/14976/propose-fee', body: { bid_id: 2587, bid_type: 'arsitek', price: 5000000, proposed_termins: [{ percentage: 50, trigger_description: 'Done' }] } },
    { id: 'post.api.projects.project.propose-fee', role: 'user', method: 'POST', note: 'pending state', uri: 'api/projects/14976/propose-fee', body: { bid_id: 2587, bid_type: 'arsitek', price: 5000000, proposed_termins: [{ percentage: 100, trigger_description: 'Done' }] } },
    { id: 'post.api.projects.project.propose-fee', role: 'user', method: 'POST', note: 'missing bid', uri: 'api/projects/14976/propose-fee', body: { bid_id: 999999999, bid_type: 'arsitek', price: 5000000, proposed_termins: [{ percentage: 100, trigger_description: 'Done' }] } },
    { id: 'post.api.projects.project.propose-fee', role: 'user', method: 'POST', note: 'zero price', uri: 'api/projects/14976/propose-fee', body: { bid_id: 2587, bid_type: 'arsitek', price: 0, proposed_termins: [{ percentage: 100, trigger_description: 'Done' }] } },
    { id: 'post.api.projects.project.propose-fee', role: 'user', method: 'POST', note: 'PM fee structure', uri: 'api/projects/14976/propose-fee', body: { bid_id: 2587, bid_type: 'project_manager', price: 100, fee_type: 'unit', proposed_termins: [{ percentage: 100, trigger_description: 'Done' }] } },
    // Import external vendor: validation, the owner/PM gate, and the
    // insufficient-escrow 422 (rolled back, so deterministic).
    { id: 'post.api.projects.project.import-external-vendor', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/import-external-vendor', body: {} },
    { id: 'post.api.projects.project.import-external-vendor', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/import-external-vendor', body: { phase_role: 'arsitek', contact_person: 'X', phone_number: '08123' } },
    { id: 'post.api.projects.project.import-external-vendor', role: 'user', method: 'POST', note: 'bad phase', uri: 'api/projects/14976/import-external-vendor', body: { phase_role: 'bogus', contact_person: 'X', phone_number: '08123' } },
    { id: 'post.api.projects.project.import-external-vendor', role: 'user', method: 'POST', note: 'bad email', uri: 'api/projects/14976/import-external-vendor', body: { phase_role: 'arsitek', contact_person: 'X', phone_number: '08123', email: 'nope' } },
    { id: 'post.api.projects.project.import-external-vendor', role: 'user', method: 'POST', note: 'insufficient budget', uri: 'api/projects/14976/import-external-vendor', body: { phase_role: 'arsitek', contact_person: 'X', phone_number: '08123', agreed_fee: 99999999999999 } },
    // Technical audit: the participation gate, role/item validation, the
    // exists: rule (before the project-scope 422) and the scoped 404 shape.
    // Success 200s move milestones/termins/documents and stay in live proofs.
    { id: 'post.api.projects.project.technical-audit-submit', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/technical-audit-submit', body: { role_type: 'structural' } },
    { id: 'post.api.projects.project.technical-audit-submit', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/technical-audit-submit', body: {} },
    { id: 'post.api.projects.project.technical-audit-submit', role: 'user', method: 'POST', note: 'bad role', uri: 'api/projects/14976/technical-audit-submit', body: { role_type: 'bogus' } },
    { id: 'post.api.projects.project.technical-audit-submit', role: 'user', method: 'POST', note: 'missing milestone id', uri: 'api/projects/14976/technical-audit-submit', body: { role_type: 'structural', milestones: [{ status: 'approved' }] } },
    { id: 'post.api.projects.project.technical-audit-submit', role: 'pm', method: 'POST', note: 'bad item fields', uri: 'api/projects/14975/technical-audit-submit', body: { role_type: 'structural', milestones: [{ id: 1, status: 'bogus' }] } },
    { id: 'post.api.projects.project.technical-audit-submit', role: 'pm', method: 'POST', note: 'missing milestone', uri: 'api/projects/14975/technical-audit-submit', body: { role_type: 'structural', milestones: [{ id: 999999999, status: 'approved' }] } },
    // Create project: the FormRequest rules, including the JSON-document and
    // boolean rules. The 201 creates a project + ledger + activity, so it stays
    // in the live proof with cleanup.
    { id: 'projects.store', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects', body: {} },
    { id: 'projects.store', role: 'user', method: 'POST', note: 'bad budget/category/deadline', uri: 'api/projects', body: { title: 'T', description: 'D', budget: 'abc', lokasi: 'L', project_category: 'bogus', deadline: 'nope' } },
    { id: 'projects.store', role: 'user', method: 'POST', note: 'invalid dimensions JSON', uri: 'api/projects', body: { title: 'T', description: 'D', budget: 1, lokasi: 'L', project_category: 'new_build', deadline: '2026-12-31', project_dimensions: 'not-json' } },
    { id: 'projects.store', role: 'user', method: 'POST', note: 'bad boolean', uri: 'api/projects', body: { title: 'T', description: 'D', budget: 1, lokasi: 'L', project_category: 'new_build', deadline: '2026-12-31', wants_project_manager: 'maybe' } },
    { id: 'projects.store', role: 'user', method: 'POST', note: 'bad target role', uri: 'api/projects', body: { title: 'T', description: 'D', budget: 1, lokasi: 'L', project_category: 'new_build', deadline: '2026-12-31', target_role: 'bogus' } },
    // Update project: the budget guard, the gate, validation, the payment
    // plan role/split rules and the POST alias. Success 200s mutate the pinned
    // project and stay in the live proof with restore.
    { id: 'projects.update', role: 'user', method: 'PUT', note: 'budget guard', uri: 'api/projects/14976', body: { budget: 100 } },
    { id: 'projects.update', role: 'plainuser', method: 'PUT', note: 'stranger forbidden', uri: 'api/projects/14976', body: { title: 'X' } },
    { id: 'projects.update', role: 'user', method: 'PUT', note: 'bad status', uri: 'api/projects/14976', body: { status: 'bogus' } },
    { id: 'projects.update', role: 'user', method: 'PUT', note: 'bad deadline', uri: 'api/projects/14976', body: { deadline: 'nope' } },
    { id: 'projects.update', role: 'user', method: 'PUT', note: 'termin missing label', uri: 'api/projects/14976', body: { payment_termins: [{ percentage: 100, amount: 1000 }] } },
    { id: 'projects.update', role: 'user', method: 'PUT', note: 'split over 100', uri: 'api/projects/14976', body: { payment_termins: [{ label: 'A', percentage: 100, amount: 1000 }, { label: 'B', percentage: 60, amount: 1000 }] } },
    { id: 'projects.update', role: 'notaris', method: 'PUT', note: 'other role forbidden', uri: 'api/projects/14975', body: { payment_termins: [{ label: 'A', percentage: 100, amount: 1000 }], target_role: 'kontraktor' } },
    { id: 'post.api.projects.project.update', role: 'user', method: 'POST', note: 'non-string description', uri: 'api/projects/14976/update', body: { description: 5 } },
    { id: 'get.api.admin.users', role: 'admin' },
    { id: 'get.api.admin.projects', role: 'admin' },
    { id: 'get.api.admin.professionals', role: 'admin' },
    { id: 'get.api.admin.professionals.history', role: 'admin' },
    // Admin writes: the four DETERMINISTIC refusals (self-target, bad type,
    // bad status) mutate nothing. The success paths mutate and are proven
    // live with restore instead; the house 404 carries a debug trace.
    { id: 'patch.api.admin.users.user.suspend', role: 'admin', method: 'PATCH', note: 'self', uri: 'api/admin/users/31694/suspend', body: {} },
    { id: 'patch.api.admin.users.user.role', role: 'admin', method: 'PATCH', note: 'self', uri: 'api/admin/users/31694/role', body: { role_type: 'user' } },
    { id: 'patch.api.admin.professionals.type.id.status', role: 'admin', method: 'PATCH', note: 'bad type', uri: 'api/admin/professionals/chef/1/status', body: { status: 'verified' } },
    { id: 'patch.api.admin.professionals.type.id.status', role: 'admin', method: 'PATCH', note: 'bad status', uri: 'api/admin/professionals/arsitek/1/status', body: { status: 'nope' } },
    { id: 'get.api.notifications', role: 'admin' },
    { id: 'get.api.user.active-projects', role: 'user' },
    { id: 'get.api.me', role: 'user' },
    { id: 'get.api.me.unread-summary', role: 'user' },
    // The first paginated endpoint: the paginator URLs are built from the
    // caller's host, which shadow-lib normalises before comparing.
    { id: 'get.api.admin.disputes', role: 'admin' },
    // The writes use DETERMINISTIC, IDEMPOTENT bodies: the same request twice
    // gives the same answer, so a re-run needs no database reset. `email` and
    // `username` are NEVER changed — `visual:token` mints by email, and a
    // mutated address would break every later run at the mint step.
    // Each write is followed by its restore, which returns the seed row to the
    // values the visual baseline photographed. The restore is compared too.
    { id: 'put.api.me', role: 'user', method: 'PUT', body: { name: 'Shadow Check', email: 'client@example.test', username: 'malya', phone_numbers: ['+62-800-shadow'] } },
    { id: 'put.api.me', role: 'user', method: 'PUT', note: 'restore', body: { name: 'Malya (Project Owner)', email: 'client@example.test', username: 'malya' } },
    { id: 'delete.api.me.avatar', role: 'user', method: 'DELETE' },
    { id: 'post.api.me.professional', role: 'user', method: 'POST', body: { name: 'Shadow Pro', email: 'client@example.test', username: 'malya' } },
    { id: 'post.api.me.professional', role: 'user', method: 'POST', note: 'restore', body: { name: 'Malya (Project Owner)', email: 'client@example.test', username: 'malya' } },
    // The 422 path: no file attached. The golden contract pins this exact shape.
    { id: 'post.api.me.avatar', role: 'user', method: 'POST', body: {} },
    // S0 auth: the deterministic failure paths. The happy paths mint a
    // random token, so they are proven by tools/parity/shadow-auth.mjs
    // (which normalises the token and checks it on both stacks) instead.
    { id: 'post.api.login', role: null, method: 'POST', body: {} },
    { id: 'post.api.login', role: null, method: 'POST', note: 'bad password', body: { email: 'client@example.test', password: 'wrong' } },
    { id: 'post.api.register', role: null, method: 'POST', body: {} },
    { id: 'post.api.forgot-password', role: null, method: 'POST', body: {} },
    { id: 'post.api.reset-password', role: null, method: 'POST', body: {} },
    // S1 public directories: unauthenticated reads, deterministic bodies.
    { id: 'get.api.arsitek', role: null },
    { id: 'get.api.kontraktor', role: null },
    { id: 'get.api.interior', role: null },
    { id: 'get.api.notaris', role: null },
    { id: 'get.api.project-manager', role: null },
    { id: 'get.api.structural-engineers', role: null },
    { id: 'get.api.mep-engineers', role: null },
    // S1 houses: unauthenticated reads, deterministic bodies. The show
    // route stays out: there is no stable live id to pin (only 200-path
    // routes join PORTED — a missing id 404s with a debug trace on the
    // dev server but the golden shape in CI).
    { id: 'get.api.houses', role: null },
    { id: 'get.api.houses', role: null, note: 'search+sort', uri: 'api/houses?search=villa&sort=price_desc' },
    // S1 geocode: the 422 paths are deterministic and gated. The 200
    // paths proxy a third party (proved byte-identical against the PHP
    // re-encode of the same upstream bytes instead).
    { id: 'get.api.geocode.reverse', role: null },
    { id: 'get.api.geocode.reverse', role: null, note: 'non-numeric', uri: 'api/geocode/reverse?lat=x&lng=y' },
    { id: 'get.api.geocode.reverse', role: null, note: 'out of range', uri: 'api/geocode/reverse?lat=200&lng=200' },
    { id: 'get.api.geocode.search', role: null },
    // S2 project reads: role-scoped, paginated, viewer-gated. The show
    // route stays out — there is no stable live id to pin (only 200-path
    // routes join PORTED; the show surface is proven live per viewer).
    { id: 'get.api.projects', role: 'user' },
    { id: 'get.api.projects', role: 'admin', note: 'empty board' },
    { id: 'get.api.projects', role: 'user', note: 'feed', uri: 'api/projects?feed=true' },
    { id: 'get.api.projects', role: 'user', note: 'all', uri: 'api/projects?all=true' },
    // S2 bid lifecycle: getBids gated read + submitBid deterministic
    // guards. Success with new IDs cannot be byte-identical across
    // engines (sequences diverge), so it is proven sequentially with
    // ID/timestamp normalization instead.
    { id: 'get.api.projects.project.bids', role: 'arsitek', uri: 'api/projects/14976/bids' },
    { id: 'get.api.projects.project.bids', role: 'plainuser', note: 'forbidden', uri: 'api/projects/14976/bids' },
    { id: 'post.api.projects.project.bids', role: 'plainuser', method: 'POST', note: 'non-professional', uri: 'api/projects/14976/bids', body: { price: 1000000, proposal: 'x' } },
    { id: 'post.api.projects.project.bids', role: 'arsitek', method: 'POST', note: 'empty body', uri: 'api/projects/14977/bids', body: {} },
    { id: 'post.api.projects.project.bids', role: 'arsitek', method: 'POST', note: 'duplicate', uri: 'api/projects/14976/bids', body: { price: 1000000, proposal: 'test' } },
    // S2 bid actions: validation, auth and business-rule 422s are
    // deterministic and gated. Success paths mutate (timestamps, ids)
    // and are proven live with normalization + restore instead.
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'arsitek', method: 'POST', note: 'bad type', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'plumber', price: 100 } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'arsitek', method: 'POST', note: 'missing price', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'arsitek', method: 'POST', note: 'zero price', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'arsitek', price: 0 } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'arsitek', method: 'POST', note: 'non-numeric price', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'arsitek', price: 'abc' } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'arsitek', method: 'POST', note: 'bad services', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'arsitek', price: 100, selected_services: 'x' } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'plainuser', method: 'POST', note: 'forbidden', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'arsitek', price: 100 } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'kontraktor', method: 'POST', note: 'other pro forbidden', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'arsitek', price: 100 } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'arsitek', method: 'POST', note: 'already offered', uri: 'api/projects/14976/bids/2587/negotiate', body: { bid_type: 'arsitek', price: 100 } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'notaris', method: 'POST', note: 'non-numeric price', uri: 'api/projects/14977/bids/98/negotiate', body: { bid_type: 'notaris', price: 'abc' } },
    { id: 'post.api.projects.project.bids.bid.negotiate', role: 'notaris', method: 'POST', note: 'negative price', uri: 'api/projects/14977/bids/98/negotiate', body: { bid_type: 'notaris', price: -5 } },
    { id: 'post.api.projects.project.bids.bid.confirm-fee', role: 'arsitek', method: 'POST', note: 'missing type', uri: 'api/projects/14976/bids/2587/confirm-fee', body: {} },
    { id: 'post.api.projects.project.bids.bid.confirm-fee', role: 'arsitek', method: 'POST', note: 'numeric type', uri: 'api/projects/14976/bids/2587/confirm-fee', body: { bid_type: 123 } },
    { id: 'post.api.projects.project.bids.bid.confirm-fee', role: 'plainuser', method: 'POST', note: 'forbidden', uri: 'api/projects/14976/bids/2587/confirm-fee', body: { bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.bids.bid.confirm-fee', role: 'arsitek', method: 'POST', note: 'own proposal', uri: 'api/projects/14976/bids/2587/confirm-fee', body: { bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.bids.bid.accept-invite', role: 'arsitek', method: 'POST', note: 'bad type', uri: 'api/projects/14976/bids/2587/accept-invite', body: { bid_type: 'nope' } },
    { id: 'post.api.projects.project.bids.bid.accept-invite', role: 'kontraktor', method: 'POST', note: 'non-bidder forbidden', uri: 'api/projects/14976/bids/2587/accept-invite', body: { bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.bids.bid.accept-invite', role: 'arsitek', method: 'POST', note: 'no longer active', uri: 'api/projects/14976/bids/2587/accept-invite', body: { bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.bids.bid.reject-invite', role: 'arsitek', method: 'POST', note: 'bad type', uri: 'api/projects/14976/bids/2587/reject-invite', body: { bid_type: 'nope' } },
    { id: 'post.api.projects.project.bids.bid.reject-invite', role: 'kontraktor', method: 'POST', note: 'non-bidder forbidden', uri: 'api/projects/14976/bids/2587/reject-invite', body: { bid_type: 'arsitek' } },
    // S2 decisions: accept/decline validation + auth gates are
    // deterministic and gated. The 200s mutate (hires, rejections,
    // addendums, milestones, logs, notifications) and are proven live
    // with normalization + restore instead.
    { id: 'post.api.projects.project.accept-bid', role: 'plainuser', method: 'POST', note: 'non-owner', uri: 'api/projects/14976/accept-bid', body: { bid_id: 2587, bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.accept-bid', role: 'user', method: 'POST', note: 'missing bid', uri: 'api/projects/14976/accept-bid', body: { bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.accept-bid', role: 'user', method: 'POST', note: 'pm type rejected', uri: 'api/projects/14976/accept-bid', body: { bid_id: 2587, bid_type: 'project_manager' } },
    { id: 'post.api.projects.project.accept-bid', role: 'user', method: 'POST', note: 'non-integer bid', uri: 'api/projects/14976/accept-bid', body: { bid_id: 'abc', bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.accept-bid', role: 'user', method: 'POST', note: 'non-string notes', uri: 'api/projects/14976/accept-bid', body: { bid_id: 2587, bid_type: 'arsitek', verification_notes: 123 } },
    { id: 'post.api.projects.project.decline-bid', role: 'plainuser', method: 'POST', note: 'non-owner', uri: 'api/projects/14976/decline-bid', body: { bid_id: 2587, bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.decline-bid', role: 'user', method: 'POST', note: 'pm managed', uri: 'api/projects/14976/decline-bid', body: { bid_id: 2587, bid_type: 'arsitek' } },
    { id: 'post.api.projects.project.decline-bid', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14977/decline-bid', body: {} },
    { id: 'post.api.projects.project.decline-bid', role: 'user', method: 'POST', note: 'bad type', uri: 'api/projects/14977/decline-bid', body: { bid_id: 98, bid_type: 'nope' } },
    // S2 contract signing: validation, auth and pre-transaction business
    // rules are deterministic and gated. The 200s mutate (termins,
    // milestones, files, snapshots, bank rows) and are proven live with
    // normalization + restore instead.
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'empty body', uri: 'api/projects/14976/bids/2587/sign-contract', body: {} },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'bad type', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'plumber' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'termins string', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: 'x', bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'termins empty', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'missing label', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'percentage over 100', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 150, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'non-numeric amount', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 'abc' }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'negative percentage', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: -5, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'non-string label', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 5, percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'non-numeric percentage', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 'abc', amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'non-object item', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: ['x'], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'milestone missing title', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], milestones: [{ description: 'x' }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'milestone non-string description', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], milestones: [{ title: 'T', description: 5 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'milestones string', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], milestones: 'x', bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'bad signature', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], signature: 'notadata', bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'numeric signature', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], signature: 123, bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'bad account digits', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12ab5678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'short account', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '1234', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'short and non-digit account', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: 'ab12', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'numeric account', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: 12345678, bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'short account name', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Gi' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'non-string bank', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 5, bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'kontraktor', method: 'POST', note: 'non-bidder forbidden', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.sign-contract', role: 'arsitek', method: 'POST', note: 'not signable', uri: 'api/projects/14976/bids/2587/sign-contract', body: { bid_type: 'arsitek', termins: [{ label: 'DP', percentage: 100, amount: 68000000 }], bank_type: 'BCA', bank_account_no: '12345678', bank_account_name: 'Giska' } },
    { id: 'post.api.projects.project.bids.bid.client-sign-contract', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14977/bids/98/client-sign-contract', body: {} },
    { id: 'post.api.projects.project.bids.bid.client-sign-contract', role: 'user', method: 'POST', note: 'numeric type', uri: 'api/projects/14977/bids/98/client-sign-contract', body: { bid_type: 5, signature: 'data:image/png;base64,iVBORw0KGgo=' } },
    { id: 'post.api.projects.project.bids.bid.client-sign-contract', role: 'user', method: 'POST', note: 'bad signature', uri: 'api/projects/14977/bids/98/client-sign-contract', body: { bid_type: 'notaris', signature: 'zzz' } },
    { id: 'post.api.projects.project.bids.bid.client-sign-contract', role: 'arsitek', method: 'POST', note: 'non-owner forbidden', uri: 'api/projects/14976/bids/2587/client-sign-contract', body: { bid_type: 'arsitek', signature: 'data:image/png;base64,iVBORw0KGgo=' } },
    { id: 'post.api.projects.project.bids.bid.client-sign-contract', role: 'user', method: 'POST', note: 'pending state', uri: 'api/projects/14977/bids/98/client-sign-contract', body: { bid_type: 'notaris', signature: 'data:image/png;base64,iVBORw0KGgo=' } },
    { id: 'post.api.projects.project.bids.bid.client-sign-contract', role: 'user', method: 'POST', note: 'accepted state', uri: 'api/projects/14975/bids/97/client-sign-contract', body: { bid_type: 'notaris', signature: 'data:image/png;base64,iVBORw0KGgo=' } },
    // S2 budget dashboard: owner-or-PM read, deterministic shapes.
    // (No mutation anywhere on the path, so the fullest live boards
    // gate directly — including the scratch sandbox/termin rows below,
    // which are deleted after the turn.)
    { id: 'get.api.projects.project.budget', role: 'user', uri: 'api/projects/14976/budget' },
    { id: 'get.api.projects.project.budget', role: 'user', note: 'full board', uri: 'api/projects/14975/budget' },
    { id: 'get.api.projects.project.budget', role: 'pm', note: 'assigned pm', uri: 'api/projects/14975/budget' },
    { id: 'get.api.projects.project.budget', role: 'plainuser', note: 'forbidden', uri: 'api/projects/14976/budget' },
    // S2 budget writes: owner-only transactions with the custom
    // Validation-error envelope, owner-or-PM sandbox planning with the
    // standard bag. Success 200s mutate (ceiling, ledger, plan rows)
    // and stay out — proven live with normalization + restore instead.
    // Missing-id 404s carry the dev debug trace, so they stay out too.
    { id: 'post.api.projects.project.budget.transactions', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14977/budget/transactions', body: {} },
    { id: 'post.api.projects.project.budget.transactions', role: 'user', method: 'POST', note: 'bad type', uri: 'api/projects/14977/budget/transactions', body: { transaction_type: 'payment', amount: 100, title: 't' } },
    { id: 'post.api.projects.project.budget.transactions', role: 'user', method: 'POST', note: 'zero amount', uri: 'api/projects/14977/budget/transactions', body: { transaction_type: 'deposit', amount: 0, title: 't' } },
    { id: 'post.api.projects.project.budget.transactions', role: 'user', method: 'POST', note: 'non-numeric amount', uri: 'api/projects/14977/budget/transactions', body: { transaction_type: 'deposit', amount: 'abc', title: 't' } },
    { id: 'post.api.projects.project.budget.transactions', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14977/budget/transactions', body: { transaction_type: 'deposit', amount: 100, title: 't' } },
    { id: 'post.api.projects.project.budget.transactions', role: 'user', method: 'POST', note: 'insufficient escrow', uri: 'api/projects/14977/budget/transactions', body: { transaction_type: 'adjustment_down', amount: 99999999999999, title: 't' } },
    // S2 mark-paid: owner-only declaration with the standard bag, the
    // 500 generic on a missing row, and the already-paid 422. Success
    // 200s flip state, write ledger rows, notify and log — proven live
    // with normalization + restore instead. No gate entry names a live
    // paid row's id... (addendum 934 stays paid: the guard fails before
    // any write, so it never drifts).
    { id: 'post.api.projects.project.budget.mark-paid', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14977/budget/mark-paid', body: {} },
    { id: 'post.api.projects.project.budget.mark-paid', role: 'user', method: 'POST', note: 'bad type', uri: 'api/projects/14977/budget/mark-paid', body: { type: 'wire', id: 1 } },
    { id: 'post.api.projects.project.budget.mark-paid', role: 'user', method: 'POST', note: 'non-integer id', uri: 'api/projects/14977/budget/mark-paid', body: { type: 'termin', id: 'abc' } },
    { id: 'post.api.projects.project.budget.mark-paid', role: 'user', method: 'POST', note: 'false id', uri: 'api/projects/14977/budget/mark-paid', body: { type: 'termin', id: false } },
    { id: 'post.api.projects.project.budget.mark-paid', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14977/budget/mark-paid', body: { type: 'termin', id: 1 } },
    { id: 'post.api.projects.project.budget.mark-paid', role: 'user', method: 'POST', note: 'missing row', uri: 'api/projects/14977/budget/mark-paid', body: { type: 'termin', id: 999999999 } },
    { id: 'post.api.projects.project.budget.mark-paid', role: 'user', method: 'POST', note: 'already paid', uri: 'api/projects/14975/budget/mark-paid', body: { type: 'addendum', id: 934 } },
    // S2 budget addendum proposals: hired-pro-only gate with the
    // standard bag. Success 201s mint the row and stay out — proven
    // live with id/timestamp normalization + restore instead.
    // Attachment guards need multipart bodies, so they stay out for the
    // same reason: the gate speaks JSON only.
    { id: 'post.api.projects.project.budget.addendums', role: 'user', method: 'POST', note: 'non-hired forbidden', uri: 'api/projects/14975/budget/addendums', body: { title: 'x', amount: 100 } },
    { id: 'post.api.projects.project.budget.addendums', role: 'notaris', method: 'POST', note: 'empty body', uri: 'api/projects/14975/budget/addendums', body: {} },
    { id: 'post.api.projects.project.budget.addendums', role: 'notaris', method: 'POST', note: 'bad type', uri: 'api/projects/14975/budget/addendums', body: { title: 'x', amount: 100, type: 'zzz' } },
    { id: 'post.api.projects.project.budget.addendums', role: 'notaris', method: 'POST', note: 'missing team member', uri: 'api/projects/14975/budget/addendums', body: { title: 'x', amount: 100, team_member_id: 999999 } },
    // S2 budget addendum decisions: the authoriser/proposer split with
    // per-side 403s, the negotiable-state 422, and the standard bag.
    // Success 200s flip state, notify and log — proven live with
    // restore instead. Addendum 934 stays paid: the processed guard
    // fails before any write, so it never drifts.
    { id: 'put.api.projects.project.budget.addendums.id', role: 'user', method: 'PUT', note: 'missing row', uri: 'api/projects/14975/budget/addendums/999999999', body: { status: 'rejected' } },
    { id: 'put.api.projects.project.budget.addendums.id', role: 'plainuser', method: 'PUT', note: 'stranger forbidden', uri: 'api/projects/14975/budget/addendums/935', body: { status: 'rejected' } },
    { id: 'put.api.projects.project.budget.addendums.id', role: 'user', method: 'PUT', note: 'empty body', uri: 'api/projects/14975/budget/addendums/935', body: {} },
    { id: 'put.api.projects.project.budget.addendums.id', role: 'user', method: 'PUT', note: 'bad status', uri: 'api/projects/14975/budget/addendums/935', body: { status: 'paid' } },
    { id: 'put.api.projects.project.budget.addendums.id', role: 'pm', method: 'PUT', note: 'processed', uri: 'api/projects/14975/budget/addendums/934', body: { status: 'rejected' } },
    // S2 verify-payment: hired-architect-only gate behind the
    // planning-approved and not-yet-verified guards. Success settles
    // the accepted bid, regenerates milestones and answers the lean
    // resource — proven live with normalization + restore instead.
    { id: 'post.api.projects.project.verify-payment', role: 'user', method: 'POST', note: 'non-architect forbidden', uri: 'api/projects/14977/verify-payment' },
    { id: 'post.api.projects.project.verify-payment', role: 'arsitek', method: 'POST', note: 'unhired forbidden', uri: 'api/projects/14977/verify-payment' },
    // S2 generic addendum authorisation: owner-or-PM gate with a
    // distinct 403 per verb, the binding 404, and the pending-approval
    // 400 (the cluster's only 400). Success 200s flip state, notify and
    // log — proven live with restore instead. Addendum 934 stays paid:
    // the state gate fails before any write, so it never drifts.
    { id: 'post.api.projects.project.addendums.addendum.approve', role: 'user', method: 'POST', note: 'cross-project binding', uri: 'api/projects/14976/addendums/935/approve' },
    { id: 'post.api.projects.project.addendums.addendum.approve', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/addendums/935/approve' },
    { id: 'post.api.projects.project.addendums.addendum.approve', role: 'user', method: 'POST', note: 'wrong state', uri: 'api/projects/14975/addendums/934/approve' },
    { id: 'post.api.projects.project.addendums.addendum.reject', role: 'user', method: 'POST', note: 'cross-project binding', uri: 'api/projects/14976/addendums/935/reject' },
    { id: 'post.api.projects.project.addendums.addendum.reject', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/addendums/935/reject' },
    { id: 'post.api.projects.project.addendums.addendum.reject', role: 'user', method: 'POST', note: 'wrong state', uri: 'api/projects/14975/addendums/934/reject' },
    // S2 lifecycle reads: BAST compiles the handover certificate off the
    // UTC wall clock (document number and date are same-day on both
    // stacks), legal-financials answers the escrow figures off the same
    // sums the write guard enforces. Both are participant-gated.
    { id: 'get.api.projects.project.bast', role: 'user', uri: 'api/projects/14976/bast' },
    { id: 'get.api.projects.project.bast', role: 'notaris', note: 'hired pro', uri: 'api/projects/14975/bast' },
    { id: 'get.api.projects.project.bast', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/bast' },
    { id: 'get.api.projects.project.legal-financials', role: 'user', uri: 'api/projects/14975/legal-financials' },
    { id: 'get.api.projects.project.legal-financials', role: 'pm', note: 'assigned pm', uri: 'api/projects/14975/legal-financials' },
    { id: 'get.api.projects.project.legal-financials', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14975/legal-financials' },
    { id: 'get.api.projects.project.legal-financials', role: 'arsitek', note: 'non-notary pro forbidden', uri: 'api/projects/14975/legal-financials' },
    // S2 lifecycle writes: invite (owner/architect/PM), mark-complete
    // (owner-only) and delete (owner-only). Success paths mutate (bids,
    // status, soft delete, notifications, logs) and stay out — proven
    // live with restore instead. The delete gates are deterministic and
    // never write: 14975 is hired, so it answers the hired-pro 422.
    { id: 'post.api.projects.project.invite', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/invite', body: { professional_id: 6634, role_type: 'arsitek' } },
    { id: 'post.api.projects.project.invite', role: 'user', method: 'POST', note: 'missing professional', uri: 'api/projects/14976/invite', body: { professional_id: 999999999, role_type: 'arsitek' } },
    { id: 'post.api.projects.project.invite', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/invite', body: {} },
    { id: 'post.api.projects.project.invite', role: 'user', method: 'POST', note: 'bad role', uri: 'api/projects/14976/invite', body: { professional_id: 6634, role_type: 'plumber' } },
    { id: 'post.api.projects.project.invite', role: 'user', method: 'POST', note: 'already has bid', uri: 'api/projects/14976/invite', body: { professional_id: 6634, role_type: 'arsitek' } },
    { id: 'post.api.projects.project.mark-complete', role: 'plainuser', method: 'POST', note: 'non-owner forbidden', uri: 'api/projects/14976/mark-complete' },
    { id: 'projects.destroy', role: 'plainuser', method: 'DELETE', note: 'non-owner forbidden', uri: 'api/projects/14976' },
    { id: 'projects.destroy', role: 'user', method: 'DELETE', note: 'hired professionals', uri: 'api/projects/14975' },
    // S2 sub-professionals: participant-gated roster plus the assign and
    // row-state verbs. Success paths mutate (roster rows, project slots,
    // notifications) and stay out — proven live with restore instead.
    { id: 'get.api.projects.project.sub-professionals', role: 'user', uri: 'api/projects/14975/sub-professionals' },
    { id: 'get.api.projects.project.sub-professionals', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14975/sub-professionals' },
    { id: 'post.api.projects.project.sub-professionals', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/sub-professionals', body: {} },
    { id: 'post.api.projects.project.sub-professionals', role: 'user', method: 'POST', note: 'bad parent role', uri: 'api/projects/14975/sub-professionals', body: { user_id: 31690, parent_role: 'owner', sub_role: 'structural' } },
    { id: 'post.api.projects.project.sub-professionals', role: 'user', method: 'POST', note: 'missing user', uri: 'api/projects/14975/sub-professionals', body: { user_id: 999999999, parent_role: 'arsitek', sub_role: 'structural' } },
    { id: 'post.api.projects.project.sub-professionals', role: 'notaris', method: 'POST', note: 'non-lead forbidden', uri: 'api/projects/14975/sub-professionals', body: { user_id: 31690, parent_role: 'arsitek', sub_role: 'structural' } },
    // S2 pm-bids: the PM's own submission plus owner decisions. Success
    // paths mutate (bid, pm_id, notifications) and stay out — proven live
    // with restore instead. 14977 does not want a PM, so the role-gated
    // submission answers the 400 deterministically.
    { id: 'post.api.projects.project.pm-bids', role: 'user', method: 'POST', note: 'non-PM forbidden', uri: 'api/projects/14977/pm-bids', body: { price: 1, proposal: 'x' } },
    { id: 'post.api.projects.project.pm-bids', role: 'pm', method: 'POST', note: 'not wanted', uri: 'api/projects/14977/pm-bids', body: { price: 1, proposal: 'x' } },
    { id: 'post.api.projects.project.pm-bids', role: 'pm', method: 'POST', note: 'empty body', uri: 'api/projects/14976/pm-bids', body: {} },
    // S3 permit verifications: owner-or-PM gate, and PBG's regulatory
    // pre-gate on the approved construction brief. Success 200s stamp the
    // column and answer the lean resource — proven live with restore.
    { id: 'post.api.projects.project.verify-pbg', role: 'notaris', method: 'POST', note: 'non-owner forbidden', uri: 'api/projects/14975/verify-pbg' },
    { id: 'post.api.projects.project.verify-pbg', role: 'user', method: 'POST', note: 'brief not approved', uri: 'api/projects/14976/verify-pbg' },
    { id: 'post.api.projects.project.verify-slf', role: 'notaris', method: 'POST', note: 'non-owner forbidden', uri: 'api/projects/14975/verify-slf' },
    // S4 documents: participant-gated list with the optional target_role
    // filter. Live fixtures carry no documents, so the empty answer is
    // deterministic; rows append a signed `file_url` (environment
    // dependent) and stay out of the byte gate.
    { id: 'get.api.projects.project.documents', role: 'user', uri: 'api/projects/14976/documents' },
    { id: 'get.api.projects.project.documents', role: 'user', note: 'role filter', uri: 'api/projects/14976/documents?target_role=structural' },
    { id: 'get.api.projects.project.documents', role: 'notaris', note: 'hired pro', uri: 'api/projects/14975/documents' },
    { id: 'get.api.projects.project.documents', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/documents' },
    // S4 document writes: participant gate on store, uploader-or-owner on
    // update/delete, owner-or-PM on verify, and the verified/approved lock.
    // Success paths write files and rows, so only the failure paths join
    // the gate; the 200s are proven live with normalization + restore.
    { id: 'post.api.projects.project.documents', role: 'user', method: 'POST', note: 'missing file', uri: 'api/projects/14976/documents', body: {} },
    // S4 design review: specialist submits, owner/PM approves or requests a
    // revision. Success 200s move documents, milestones and payment stages
    // — proven live with restore; only the validation/gate paths gate.
    { id: 'post.api.projects.project.documents.submit-design', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/documents/submit-design', body: {} },
    { id: 'post.api.projects.project.documents.submit-design', role: 'user', method: 'POST', note: 'bad role', uri: 'api/projects/14976/documents/submit-design', body: { role_type: 'design' } },
    { id: 'post.api.projects.project.documents.submit-design', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/documents/submit-design', body: { role_type: 'structural' } },
    { id: 'post.api.projects.project.documents.approve-design', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/documents/approve-design', body: {} },
    { id: 'post.api.projects.project.documents.approve-design', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/documents/approve-design', body: { role_type: 'structural' } },
    { id: 'post.api.projects.project.documents.revise-design', role: 'user', method: 'POST', note: 'missing note', uri: 'api/projects/14976/documents/revise-design', body: { role_type: 'structural' } },
    { id: 'post.api.projects.project.documents.revise-design', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/documents/revise-design', body: { role_type: 'structural', note: 'x' } },
    // S4 material folders: owner / assigned PM / hired pro only. The list
    // is deterministic; create/update/delete mutate and are proven live.
    { id: 'get.api.projects.project.material-folders', role: 'user', uri: 'api/projects/14975/material-folders' },
    { id: 'get.api.projects.project.material-folders', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14975/material-folders' },
    { id: 'post.api.projects.project.material-folders', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/material-folders', body: { name: 'x' } },
    { id: 'post.api.projects.project.material-folders', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/material-folders', body: {} },
    { id: 'post.api.projects.project.material-folders', role: 'user', method: 'POST', note: 'bad bom type', uri: 'api/projects/14975/material-folders', body: { name: 'x', bom_type: 'wood' } },
    // S5 change orders and timeline extensions: participant proposals, PM
    // review and owner decision. Lists are deterministic; the mutations
    // (and the money-minting approval) are proven live.
    { id: 'get.api.projects.project.change-orders', role: 'user', uri: 'api/projects/14975/change-orders' },
    { id: 'get.api.projects.project.change-orders', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14975/change-orders' },
    { id: 'post.api.projects.project.change-orders', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/change-orders', body: {} },
    { id: 'post.api.projects.project.change-orders', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/change-orders', body: {} },
    { id: 'post.api.projects.project.change-orders', role: 'user', method: 'POST', note: 'negative cost', uri: 'api/projects/14975/change-orders', body: { title: 'x', description: 'y', cost_impact: -1 } },
    { id: 'get.api.projects.project.extensions', role: 'user', uri: 'api/projects/14975/extensions' },
    { id: 'get.api.projects.project.extensions', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14975/extensions' },
    { id: 'post.api.projects.project.extensions', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/extensions', body: {} },
    { id: 'post.api.projects.project.extensions', role: 'user', method: 'POST', note: 'zero days', uri: 'api/projects/14975/extensions', body: { reason: 'x', days_requested: 0 } },
    // S6 daily site logs: participant list, contractor/PM/active-sub store
    // with the PBG gate, author-only delete with the binding checked first.
    { id: 'get.api.projects.project.daily-logs', role: 'user', uri: 'api/projects/14975/daily-logs' },
    { id: 'get.api.projects.project.daily-logs', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14975/daily-logs' },
    { id: 'post.api.projects.project.daily-logs', role: 'user', method: 'POST', note: 'owner forbidden', uri: 'api/projects/14975/daily-logs', body: { log_date: '2026-10-30', weather: 'sun', worker_count: 1, activities: 'work' } },
    { id: 'post.api.projects.project.daily-logs', role: 'kontraktor', method: 'POST', note: 'empty body', uri: 'api/projects/14975/daily-logs', body: {} },
    { id: 'post.api.projects.project.daily-logs', role: 'kontraktor', method: 'POST', note: 'bad date', uri: 'api/projects/14975/daily-logs', body: { log_date: 'xx', weather: 'sun', worker_count: 1, activities: 'work' } },
    // S3 seal-design: hired-architect only, then the structural-hire and
    // deliverable-upload gates. Success 200s stamp the handover, log and
    // notify, answering the full resource — proven live with restore.
    { id: 'post.api.projects.project.seal-design', role: 'notaris', method: 'POST', note: 'non-architect forbidden', uri: 'api/projects/14975/seal-design' },
    { id: 'post.api.projects.project.seal-design', role: 'arsitek', method: 'POST', note: 'unhired forbidden', uri: 'api/projects/14975/seal-design' },
    // S3 remaining seals + phase authorization: hired-role gates and the
    // owner/PM gate; success 200s stamp, log, notify and answer the full
    // resource — proven live with restore.
    { id: 'post.api.projects.project.seal-construction', role: 'notaris', method: 'POST', note: 'non-contractor forbidden', uri: 'api/projects/14975/seal-construction' },
    { id: 'post.api.projects.project.seal-interior', role: 'notaris', method: 'POST', note: 'non-interior forbidden', uri: 'api/projects/14975/seal-interior' },
    { id: 'post.api.projects.project.seal-legal', role: 'arsitek', method: 'POST', note: 'non-notary forbidden', uri: 'api/projects/14975/seal-legal' },
    { id: 'post.api.projects.project.authorize-phase', role: 'notaris', method: 'POST', note: 'non-owner forbidden', uri: 'api/projects/14975/authorize-phase', body: { phase: 'design', authorize: true } },
    { id: 'post.api.projects.project.authorize-phase', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14975/authorize-phase', body: {} },
    { id: 'post.api.projects.project.authorize-phase', role: 'user', method: 'POST', note: 'bad phase', uri: 'api/projects/14975/authorize-phase', body: { phase: 'legal', authorize: true } },
    { id: 'post.api.projects.project.authorize-phase', role: 'user', method: 'POST', note: 'bad boolean', uri: 'api/projects/14975/authorize-phase', body: { phase: 'design', authorize: 'maybe' } },
    // S3 verify-legal: owner/PM gate then the handover prerequisite.
    // Success 200s lock the phase, unblock the first locked notaris stage
    // and answer the full resource — proven live with restore.
    { id: 'post.api.projects.project.verify-legal', role: 'notaris', method: 'POST', note: 'non-owner forbidden', uri: 'api/projects/14975/verify-legal' },
    { id: 'post.api.projects.project.verify-legal', role: 'user', method: 'POST', note: 'no handover', uri: 'api/projects/14976/verify-legal' },
    // S3 planning machine: architect proposes, PM verifies, owner
    // approves; rejection routes by role. Success 200s flip the status and
    // answer the lean resource — proven live with restore.
    { id: 'post.api.projects.project.submit-planning', role: 'notaris', method: 'POST', note: 'non-architect forbidden', uri: 'api/projects/14975/submit-planning' },
    { id: 'post.api.projects.project.approve-planning', role: 'plainuser', method: 'POST', note: 'non-owner forbidden', uri: 'api/projects/14976/approve-planning' },
    { id: 'post.api.projects.project.approve-planning', role: 'user', method: 'POST', note: 'no proposal', uri: 'api/projects/14976/approve-planning' },
    { id: 'post.api.projects.project.reject-planning', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/reject-planning' },
    { id: 'post.api.projects.project.reject-planning', role: 'user', method: 'POST', note: 'no proposal', uri: 'api/projects/14976/reject-planning' },
    { id: 'post.api.projects.project.verify-planning-pm', role: 'user', method: 'POST', note: 'non-pm forbidden', uri: 'api/projects/14976/verify-planning-pm' },
    { id: 'post.api.projects.project.update-planning-audit', role: 'user', method: 'POST', note: 'non-pm forbidden', uri: 'api/projects/14976/update-planning-audit' },
    { id: 'post.api.projects.project.budget.sandbox', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14977/budget/sandbox', body: {} },
    { id: 'post.api.projects.project.budget.sandbox', role: 'user', method: 'POST', note: 'non-numeric amount', uri: 'api/projects/14977/budget/sandbox', body: { title: 'x', estimated_amount: 'abc' } },
    { id: 'post.api.projects.project.budget.sandbox', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14977/budget/sandbox', body: { title: 'x', estimated_amount: 5 } },
    { id: 'put.api.projects.project.budget.sandbox.id', role: 'plainuser', method: 'PUT', note: 'stranger forbidden', uri: 'api/projects/14977/budget/sandbox/1' },
    { id: 'put.api.projects.project.budget.sandbox.id.update', role: 'user', method: 'PUT', note: 'empty body', uri: 'api/projects/14977/budget/sandbox/999999999/update', body: {} },
    { id: 'put.api.projects.project.budget.sandbox.id.update', role: 'plainuser', method: 'PUT', note: 'stranger forbidden', uri: 'api/projects/14977/budget/sandbox/1/update', body: { title: 'x', estimated_amount: 5 } },
    { id: 'delete.api.projects.project.budget.sandbox.id', role: 'plainuser', method: 'DELETE', note: 'stranger forbidden', uri: 'api/projects/14977/budget/sandbox/1' },
    // S2 activity: participant-only event stream, newest first, capped
    // at 50. The scratch rows below exercise the non-empty shape on both
    // engines; they are deleted after the turn.
    { id: 'get.api.projects.project.activity', role: 'user', uri: 'api/projects/14976/activity' },
    { id: 'get.api.projects.project.activity', role: 'user', note: 'empty board', uri: 'api/projects/14975/activity' },
    { id: 'get.api.projects.project.activity', role: 'pm', note: 'assigned pm', uri: 'api/projects/14975/activity' },
    { id: 'get.api.projects.project.activity', role: 'notaris', note: 'hired pro', uri: 'api/projects/14975/activity' },
    { id: 'get.api.projects.project.activity', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/activity' },
    { id: 'get.api.projects.project.activity', role: 'arsitek', note: 'bidder forbidden', uri: 'api/projects/14976/activity' },
    // S2 payment termins: owner-or-hired read; owner/PM/hired write with
    // the terminplan guards. Success paths mutate (termins, logs) and are
    // proven live with normalization + restore instead.
    { id: 'get.api.projects.project.payment-termins', role: 'user', uri: 'api/projects/14976/payment-termins' },
    { id: 'get.api.projects.project.payment-termins', role: 'plainuser', note: 'forbidden', uri: 'api/projects/14976/payment-termins' },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/payment-termins', body: {} },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'non-integer amount', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 5.5, role_type: 'arsitek' } },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'non-numeric amount', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 'abc', role_type: 'arsitek' } },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'foreign milestone', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 100, role_type: 'arsitek', milestone_id: 999999 } },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'bad status', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 100, role_type: 'arsitek', status: 'paid' } },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'numeric status', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 100, role_type: 'arsitek', status: 5 } },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'owner without role', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 100 } },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'oversize amount', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 100000000000000, role_type: 'arsitek' } },
    { id: 'post.api.projects.project.payment-termins', role: 'user', method: 'POST', note: 'non-string trigger', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 100, role_type: 'arsitek', trigger_description: 5 } },
    { id: 'post.api.projects.project.payment-termins', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/payment-termins', body: { label: 'T', percentage: 50, amount: 100, role_type: 'arsitek' } },
    // S2 milestones: participant-only work plan (owner, PM, hired pro,
    // active sub-pro), newest... in id order, relations un-appended.
    // Non-empty shapes are proven live with scratch rows + restore.
    { id: 'get.api.projects.project.milestones', role: 'user', uri: 'api/projects/14976/milestones' },
    { id: 'get.api.projects.project.milestones', role: 'user', note: 'full board', uri: 'api/projects/14975/milestones' },
    { id: 'get.api.projects.project.milestones', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/milestones' },
    { id: 'get.api.projects.project.milestones', role: 'notaris', note: 'hired pro', uri: 'api/projects/14975/milestones' },
    { id: 'get.api.projects.project.milestones', role: 'pm', note: 'assigned pm', uri: 'api/projects/14975/milestones' },
    // S2 milestone store: validation + guards are deterministic and gated.
    // The 200 mutates (milestone, gallery files, change orders, vault
    // docs, logs) and is proven live with normalization + restore instead.
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/milestones', body: {} },
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'bad date', uri: 'api/projects/14976/milestones', body: { title: 'T', start_date: 'xx' } },
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'float sort order', uri: 'api/projects/14976/milestones', body: { title: 'T', sort_order: 1.5 } },
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'missing target', uri: 'api/projects/14976/milestones', body: { title: 'T', target_notaris_id: 999999 } },
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'negative cost', uri: 'api/projects/14976/milestones', body: { title: 'T', cost_impact: -5 } },
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'float time impact', uri: 'api/projects/14976/milestones', body: { title: 'T', time_impact_days: 1.5 } },
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'string gallery', uri: 'api/projects/14976/milestones', body: { title: 'T', gallery: 'x' } },
    { id: 'post.api.projects.project.milestones', role: 'user', method: 'POST', note: 'numeric content', uri: 'api/projects/14976/milestones', body: { title: 'T', content: 5 } },
    { id: 'post.api.projects.project.milestones', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/milestones', body: { title: 'T' } },
    // S2 requirements: owner-or-hired read; owner/PM/hired write with an
    // optional vault image (hash-named, so success paths stay out of the
    // gate — proven live with hash normalization instead).
    { id: 'get.api.projects.project.requirements', role: 'user', uri: 'api/projects/14976/requirements' },
    { id: 'get.api.projects.project.requirements', role: 'notaris', note: 'role excluded', uri: 'api/projects/14976/requirements' },
    { id: 'get.api.projects.project.requirements', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/requirements' },
    { id: 'get.api.projects.project.requirements', role: 'pm', note: 'assigned pm', uri: 'api/projects/14975/requirements' },
    { id: 'post.api.projects.project.requirements', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/requirements', body: {} },
    { id: 'post.api.projects.project.requirements', role: 'user', method: 'POST', note: 'bad bom type', uri: 'api/projects/14976/requirements', body: { name: 'X', quantity_required: 1, unit: 'pcs', bom_type: 'wood' } },
    { id: 'post.api.projects.project.requirements', role: 'user', method: 'POST', note: 'bad quality', uri: 'api/projects/14976/requirements', body: { name: 'X', quantity_required: 1, unit: 'pcs', bom_type: 'raw', quality_level: 'ultra' } },
    { id: 'post.api.projects.project.requirements', role: 'user', method: 'POST', note: 'bad category', uri: 'api/projects/14976/requirements', body: { name: 'X', quantity_required: 1, unit: 'pcs', bom_type: 'raw', category: 'plumbing' } },
    { id: 'post.api.projects.project.requirements', role: 'user', method: 'POST', note: 'missing folder', uri: 'api/projects/14976/requirements', body: { name: 'X', quantity_required: 1, unit: 'pcs', bom_type: 'raw', folder_id: 999999 } },
    { id: 'post.api.projects.project.requirements', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/requirements', body: { name: 'X', quantity_required: 1, unit: 'pcs', bom_type: 'raw' } },
    // S2 requirement update/delete: binding 404, hire gate, and nullable
    // validation are deterministic and gated. Success paths mutate (rows,
    // files, histories, logs) and are proven live with restore instead.
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'empty body', uri: 'api/projects/14976/requirements/900019264', body: {} },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'non-string name', uri: 'api/projects/14976/requirements/900019264', body: { name: 5 } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'bad quantity', uri: 'api/projects/14976/requirements/900019264', body: { quantity_required: 'abc' } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'bad bom', uri: 'api/projects/14976/requirements/900019264', body: { bom_type: 'wood' } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'bad quality', uri: 'api/projects/14976/requirements/900019264', body: { quality_level: 'ultra' } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'bad category', uri: 'api/projects/14976/requirements/900019264', body: { category: 'plumbing' } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'bad estimate', uri: 'api/projects/14976/requirements/900019264', body: { estimated_unit_cost: 'abc' } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'missing folder', uri: 'api/projects/14976/requirements/900019264', body: { folder_id: 999999 } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'plainuser', method: 'PUT', note: 'stranger forbidden', uri: 'api/projects/14976/requirements/900019264', body: { name: 'X' } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'notaris', method: 'PUT', note: 'role excluded', uri: 'api/projects/14976/requirements/900019264', body: { name: 'X' } },
    { id: 'put.api.projects.project.requirements.requirement', role: 'user', method: 'PUT', note: 'cross-project binding', uri: 'api/projects/14975/requirements/900019264', body: { name: 'X' } },
    { id: 'delete.api.projects.project.requirements.requirement', role: 'plainuser', method: 'DELETE', note: 'stranger forbidden', uri: 'api/projects/14976/requirements/900019264' },
    { id: 'delete.api.projects.project.requirements.requirement', role: 'user', method: 'DELETE', note: 'cross-project binding', uri: 'api/projects/14975/requirements/900019264' },
    // S2 requirement history: hire-gated reads, newest first. The fixture
    // row carries the single 'created' history on both engines.
    { id: 'get.api.projects.project.requirements-history', role: 'user', uri: 'api/projects/14976/requirements-history' },
    { id: 'get.api.projects.project.requirements-history', role: 'user', note: 'empty board', uri: 'api/projects/14975/requirements-history' },
    { id: 'get.api.projects.project.requirements-history', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/requirements-history' },
    { id: 'get.api.projects.project.requirements-history', role: 'notaris', note: 'role excluded', uri: 'api/projects/14976/requirements-history' },
    { id: 'get.api.projects.project.requirements.requirement.history', role: 'user', uri: 'api/projects/14976/requirements/900019264/history' },
    { id: 'get.api.projects.project.requirements.requirement.history', role: 'user', note: 'cross-project binding', uri: 'api/projects/14975/requirements/900019264/history' },
    { id: 'get.api.projects.project.requirements.requirement.history', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/requirements/900019264/history' },
    // S2 requirement stock: restock adds, use/usage consume with the
    // narrow gate (owner, hired kontraktor, assigned PM — never a
    // notary, never a stranger). Success 200s mutate stock and stay out,
    // proven live with restore instead; the insufficient-stock 422 is
    // deterministic on the zeroed fixture and gates.
    { id: 'post.api.projects.project.requirements.requirement.restock', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/requirements/900019264/restock', body: {} },
    { id: 'post.api.projects.project.requirements.requirement.restock', role: 'user', method: 'POST', note: 'bad quantity', uri: 'api/projects/14976/requirements/900019264/restock', body: { quantity: 'abc' } },
    { id: 'post.api.projects.project.requirements.requirement.restock', role: 'user', method: 'POST', note: 'zero quantity', uri: 'api/projects/14976/requirements/900019264/restock', body: { quantity: 0 } },
    { id: 'post.api.projects.project.requirements.requirement.restock', role: 'user', method: 'POST', note: 'below minimum', uri: 'api/projects/14976/requirements/900019264/restock', body: { quantity: 0.009 } },
    { id: 'post.api.projects.project.requirements.requirement.restock', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/requirements/900019264/restock', body: { quantity: 5 } },
    { id: 'post.api.projects.project.requirements.requirement.restock', role: 'notaris', method: 'POST', note: 'role excluded', uri: 'api/projects/14976/requirements/900019264/restock', body: { quantity: 5 } },
    { id: 'post.api.projects.project.requirements.requirement.restock', role: 'user', method: 'POST', note: 'cross-project binding', uri: 'api/projects/14975/requirements/900019264/restock', body: { quantity: 5 } },
    { id: 'post.api.projects.project.requirements.requirement.use', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/requirements/900019264/use', body: {} },
    { id: 'post.api.projects.project.requirements.requirement.use', role: 'user', method: 'POST', note: 'insufficient stock', uri: 'api/projects/14976/requirements/900019264/use', body: { quantity: 5 } },
    { id: 'post.api.projects.project.requirements.requirement.use', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/requirements/900019264/use', body: { quantity: 5 } },
    { id: 'post.api.projects.project.requirements.requirement.use', role: 'user', method: 'POST', note: 'cross-project binding', uri: 'api/projects/14975/requirements/900019264/use', body: { quantity: 5 } },
    { id: 'post.api.projects.project.requirements.requirement.usage', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/requirements/900019264/usage', body: {} },
    { id: 'post.api.projects.project.requirements.requirement.usage', role: 'user', method: 'POST', note: 'insufficient stock', uri: 'api/projects/14976/requirements/900019264/usage', body: { quantity: 1 } },
    { id: 'post.api.projects.project.requirements.requirement.usage', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/requirements/900019264/usage', body: { quantity: 1 } },
    { id: 'post.api.projects.project.requirements.requirement.usage', role: 'user', method: 'POST', note: 'cross-project binding', uri: 'api/projects/14975/requirements/900019264/usage', body: { quantity: 1 } },
    // S2 procurement: kontraktor/helper-sub/PM/owner gate, dispute freeze,
    // and numeric validation gate. Success 200s mint payable obligations
    // (procurement row, addendum, notification) and stay out — proven live
    // with restore on both the PM and no-PM branches instead.
    { id: 'get.api.projects.project.procurement-requests', role: 'user', uri: 'api/projects/14976/procurement-requests' },
    { id: 'get.api.projects.project.procurement-requests', role: 'plainuser', note: 'stranger forbidden', uri: 'api/projects/14976/procurement-requests' },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/requirements/900019264/request-procurement', body: {} },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'user', method: 'POST', note: 'bad quantity', uri: 'api/projects/14976/requirements/900019264/request-procurement', body: { quantity_needed: 'abc' } },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'user', method: 'POST', note: 'zero quantity', uri: 'api/projects/14976/requirements/900019264/request-procurement', body: { quantity_needed: 0 } },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'user', method: 'POST', note: 'bad estimate', uri: 'api/projects/14976/requirements/900019264/request-procurement', body: { quantity_needed: 1, estimated_unit_cost: 'x' } },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'user', method: 'POST', note: 'bad boolean', uri: 'api/projects/14976/requirements/900019264/request-procurement', body: { quantity_needed: 1, offer_to_buy: 2 } },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/requirements/900019264/request-procurement', body: { quantity_needed: 1 } },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'notaris', method: 'POST', note: 'role excluded', uri: 'api/projects/14976/requirements/900019264/request-procurement', body: { quantity_needed: 1 } },
    { id: 'post.api.projects.project.requirements.requirement.request-procurement', role: 'user', method: 'POST', note: 'cross-project binding', uri: 'api/projects/14975/requirements/900019264/request-procurement', body: { quantity_needed: 1 } },
    // S2 payment proof upload: owner/PM-only gate, FormRequest validation,
    // per-type lookup with the legacy 400/404 envelopes, dispute freeze,
    // previous-stage ordering, and settled/lifecycle 422s. Success 200s
    // write vault files and flip state, so they stay out — proven live
    // with hash/timestamp normalization and restore instead. The
    // max:5120 app rule is pre-empted locally by php.ini (2M) and the
    // file-bearing guards need multipart bodies, so both stay out for
    // the same reason: the gate speaks JSON only. Go implements the app
    // rule (production behavior).
    { id: 'post.api.projects.project.payments.type.id.upload-proof', role: 'user', method: 'POST', note: 'missing file', uri: 'api/projects/14976/payments/termin/900021255/upload-proof', body: {} },
    { id: 'post.api.projects.project.payments.type.id.upload-proof', role: 'user', method: 'POST', note: 'non-file proof', uri: 'api/projects/14976/payments/termin/900021255/upload-proof', body: { proof: 'abc' } },
    // S2 payment verify-proof: FormRequest validation, the legacy
    // 400/404 envelopes, and the 403 gate are deterministic and gated.
    // Settled/proof-gate 422s and both 200s mutate (state flips,
    // ledger rows, files, notifications) and stay out — proven live
    // with normalization + restore instead. The 900021255 fixture
    // stays locked without a proof: every gated case fails before any
    // write, so it never drifts.
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'user', method: 'POST', note: 'empty body', uri: 'api/projects/14976/payments/termin/900021255/verify-proof', body: {} },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'user', method: 'POST', note: 'bad action', uri: 'api/projects/14976/payments/termin/900021255/verify-proof', body: { action: 'maybe' } },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'user', method: 'POST', note: 'numeric action', uri: 'api/projects/14976/payments/termin/900021255/verify-proof', body: { action: 5 } },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'user', method: 'POST', note: 'numeric notes', uri: 'api/projects/14976/payments/termin/900021255/verify-proof', body: { action: 'reject', notes: 5 } },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'user', method: 'POST', note: 'owner forbidden', uri: 'api/projects/14976/payments/termin/900021255/verify-proof', body: { action: 'reject' } },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'arsitek', method: 'POST', note: 'bidder forbidden', uri: 'api/projects/14976/payments/termin/900021255/verify-proof', body: { action: 'reject' } },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14976/payments/termin/900021255/verify-proof', body: { action: 'reject' } },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'user', method: 'POST', note: 'bad type', uri: 'api/projects/14976/payments/nope/1/verify-proof', body: { action: 'reject' } },
    { id: 'post.api.projects.project.payments.type.id.verify-proof', role: 'user', method: 'POST', note: 'missing row', uri: 'api/projects/14976/payments/termin/999999999/verify-proof', body: { action: 'reject' } },
    // S2 procurement decisions: assigned-PM-only gate (long 403 on
    // verify, bare word on reject), plain binding 404, validation, and
    // the pending_pm state gate. Success 200s mint addenda and
    // notifications and stay out — proven live with restore instead.
    // Missing ids 404 with the dev debug trace, so they stay out too.
    // The 900025060 fixture stays pending_pm: every gated case fails
    // before any write, so it never drifts.
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.verify', role: 'user', method: 'POST', note: 'non-PM forbidden', uri: 'api/projects/14975/procurement-requests/900025060/verify', body: { estimated_cost: 100 } },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.verify', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/procurement-requests/900025060/verify', body: { estimated_cost: 100 } },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.verify', role: 'pm', method: 'POST', note: 'empty body', uri: 'api/projects/14975/procurement-requests/900025060/verify', body: {} },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.verify', role: 'pm', method: 'POST', note: 'bad cost', uri: 'api/projects/14975/procurement-requests/900025060/verify', body: { estimated_cost: 'abc' } },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.verify', role: 'pm', method: 'POST', note: 'negative cost', uri: 'api/projects/14975/procurement-requests/900025060/verify', body: { estimated_cost: -5 } },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.verify', role: 'pm', method: 'POST', note: 'non-string note', uri: 'api/projects/14975/procurement-requests/900025060/verify', body: { estimated_cost: 100, pm_note: 5 } },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.reject', role: 'user', method: 'POST', note: 'non-PM forbidden', uri: 'api/projects/14975/procurement-requests/900025060/reject', body: { pm_note: 'x' } },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.reject', role: 'plainuser', method: 'POST', note: 'stranger forbidden', uri: 'api/projects/14975/procurement-requests/900025060/reject', body: { pm_note: 'x' } },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.reject', role: 'pm', method: 'POST', note: 'empty body', uri: 'api/projects/14975/procurement-requests/900025060/reject', body: {} },
    { id: 'post.api.projects.project.procurement-requests.procurementRequest.reject', role: 'pm', method: 'POST', note: 'non-string note', uri: 'api/projects/14975/procurement-requests/900025060/reject', body: { pm_note: 5 } },
    // NOTE: no logout entry here. Logout revokes the token it presents,
    // and shadowRoute calls both stacks concurrently — a DELETE racing an
    // authentication read 401s on whichever stack loses, nondeterministically.
    // The happy path is proven sequentially by tools/parity/shadow-auth.mjs,
    // where each stack gets its own freshly minted token.
    // Sharing surface: both reads are EMPTY in the fixture database (no
    // preference rows, no sticky notes), so the shapes are deterministic.
    { id: 'get.api.notification-preferences', role: 'user' },
    { id: 'get.api.projects.project.sticky-notes', role: 'user', uri: 'api/projects/14976/sticky-notes' },
];

const manifest = yaml.load(readFileSync(resolve(ROOT, 'routing', 'routes.yaml'), 'utf8'));
const byId = new Map(manifest.routes.map((route) => [route.id, route]));

function token(role) {
    const email = { admin: 'admin@4c.id', user: 'client@example.test', arsitek: 'giska@example.test', plainuser: 'akmal@example.test', kontraktor: 'anindia@example.test', notaris: 'rede@example.test', pm: 'pm@4c.id' }[role];

    if (!email) {
        throw new Error(`no fixture token for role "${role}"`);
    }

    const output = execFileSync(php, ['artisan', 'visual:token', `--email=${email}`], {
        cwd: ROOT,
        encoding: 'utf8',
    });

    return JSON.parse(output.trim().split('\n').pop()).token;
}

async function waitForHealth(url, attempts = 60) {
    for (let i = 0; i < attempts; i += 1) {
        try {
            const response = await fetch(`${url}/healthz`);

            if (response.ok) {
                return true;
            }
        } catch {
            // Not listening yet.
        }

        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }

    return false;
}

// TOKENS FIRST, THEN THE COPY.
//
// `visual:token` writes to MYSQL. The gateway reads PostgreSQL. A token minted
// a second ago does not exist in the database the gateway authenticates
// against, so without this copy every ported route answers 401 and the failure
// looks like a broken authenticator rather than a missing row.
// A null role means anonymous: no token is minted or sent. Used for the
// public auth endpoints' deterministic failure paths.
// RATE LIMITS ARE PER TOKEN (`throttle:api` allows 200/min per token hash),
// so a role whose entry count crosses that ceiling needs a second token:
// the run is a burst no real client makes. Rotate through a small pool sized
// to keep every token under 150 requests.
const roleCounts = {};
for (const entry of PORTED) {
    if (entry.role === null || entry.role === undefined) continue;
    roleCounts[entry.role] = (roleCounts[entry.role] ?? 0) + 1;
}
const tokens = {};
for (const [role, count] of Object.entries(roleCounts)) {
    const minted = [];
    const poolSize = Math.max(1, Math.ceil(count / 150));
    for (let i = 0; i < poolSize; i += 1) minted.push(token(role));
    tokens[role] = minted;
}
const tokenCursor = {};

execFileSync('go', ['run', './cmd/etl', '-tables=personal_access_tokens', '-truncate'], {
    cwd: ROOT,
    env: { ...process.env, GOEXPERIMENT: 'nojsonv2', DATABASE_URL: databaseUrl },
    stdio: 'inherit',
});

mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });

const binary = resolve(ROOT, '.tmp', process.platform === 'win32' ? 'gateway-shadow.exe' : 'gateway-shadow');

execFileSync('go', ['build', '-o', binary, './cmd/gateway'], {
    cwd: ROOT,
    env: { ...process.env, GOEXPERIMENT: 'nojsonv2' },
    stdio: 'inherit',
});

const gateway = spawn(binary, [`--addr=:${port}`], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl, MYSQL_DSN: mysqlDsn },
    stdio: 'ignore',
});

let failures = 0;

try {
    if (!(await waitForHealth(`http://127.0.0.1:${port}`))) {
        console.error('::error::the gateway did not become healthy — is PostgreSQL running and ETL\'d?');
        process.exitCode = 1;
    } else {
        for (const entry of PORTED) {
            const route = byId.get(entry.id);

            if (!route) {
                console.error(`::error::${entry.id} is not in routing/routes.yaml`);
                failures += 1;
                continue;
            }

            if (route.uri.includes('{') && !entry.uri) {
                console.error(`::error::${entry.id} is parameterised; add a --uri to the PORTED entry`);
                failures += 1;
                continue;
            }

            const problems = await shadowRoute({
                route,
                laravel,
                gateway: `http://127.0.0.1:${port}`,
                token: tokens[entry.role]
                    ? tokens[entry.role][(tokenCursor[entry.role] = (tokenCursor[entry.role] ?? 0) + 1) % tokens[entry.role].length]
                    : undefined,
                uri: entry.uri,
                method: entry.method,
                body: entry.body === undefined ? null : JSON.stringify(entry.body),
            });

            if (problems.length > 0) {
                console.error(`  ${entry.method ?? route.methods[0]} /${entry.uri ?? route.uri}${entry.note ? ` (${entry.note})` : ''} — DIFFERENT`);

                for (const problem of problems) {
                    console.error(`    ${problem}`);
                }

                failures += 1;
            } else {
                console.log(`  ${entry.method ?? route.methods[0]} /${entry.uri ?? route.uri}${entry.note ? ` (${entry.note})` : ''} — identical`);
            }
        }
    }
} finally {
    gateway.kill();
}

if (failures > 0) {
    console.error(`\n${failures} ported route(s) no longer match the legacy application.`);
    process.exitCode = 1;
} else {
    console.log(`\n${PORTED.length} ported route(s) answer byte-identically to Laravel.`);
}
