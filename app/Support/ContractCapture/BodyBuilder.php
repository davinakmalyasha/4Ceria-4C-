<?php

namespace App\Support\ContractCapture;

/**
 * Turns an endpoint's validation rules into a request it will accept.
 *
 * WHY
 * ---
 * The capture records what each endpoint ANSWERS, and a 422 says nothing
 * about the endpoint's behaviour — it says the request was wrong. So each
 * endpoint has to be sent a request its own rules accept, and the rules
 * are read out of the controller (see RuleExtractor) rather than written
 * down here.
 *
 * THE VALUES ARE DETERMINISTIC
 * ----------------------------
 * The value for a field ends up in the RESPONSE — the title of a created
 * project, the label of a created milestone — so it is part of the
 * recording. It is derived from the field's own name and the rules that
 * apply to it, and never from a clock or a random number.
 *
 * WHAT IS NOT SYNTHESISED
 * -----------------------
 * A field whose rules are not a literal — a rule built from a variable, a
 * value the rules cannot imply — is LEFT OUT of the request. The endpoint
 * then answers 422 for that field, and the recording says so. Inventing a
 * value would record a success the application would not actually give.
 */
final class BodyBuilder
{
    /**
     * The table to fixture entity map, for the `exists:` rule.
     *
     * `exists:projects,id` means "an id of a row in `projects` that
     * exists", and the fixture's rows are the ones that exist.
     *
     * @var array<string, string>
     */
    private const TABLE_ENTITIES = [
        'projects' => 'project',
        'users' => 'owner',
        'house' => 'house',
        'houses' => 'house',
        'materials' => 'material',
        'suppliers' => 'supplier',
        'project_addendums' => 'addendum',
        'project_payment_termins' => 'termin',
        'project_milestones' => 'milestone',
        'project_requirements' => 'requirement',
        'project_disputes' => 'dispute',
        'project_documents' => 'document',
        'project_comments' => 'comment',
        'project_sub_professionals' => 'sub_professional',
        'project_change_orders' => 'change_order',
        'project_terminations' => 'termination',
        'project_procurement_requests' => 'procurement_request',
        'project_material_folders' => 'folder',
        'bids_arsitek' => 'bid_arsitek',
        'bids_kontraktor' => 'bid_kontraktor',
        'bids_notaris' => 'bid_notaris',
        'bids_interior' => 'bid_arsitek',
        'bids_project_manager' => 'bid_pm',
        'bids_structural' => 'bid_structural',
        'bids_mep' => 'bid_mep',
        'material_orders' => 'material_order',
        'material_quotes' => 'quote',
        'conversations' => 'conversation',
        'chat_messages' => 'message',
        'notifications' => 'notification',
        'team_members' => 'team_member',
        'firm_members' => 'firm_member',
        'notaris_consultations' => 'consultation',
        'favorites' => 'favorite',
        'delivery_jobs' => 'delivery_job',
        'rooms' => 'room',
        'house_questions' => 'house_question',
        'sticky_notes' => 'sticky_note',
        'project_reports' => 'report',
        'project_snag_items' => 'snag',
        'project_daily_logs' => 'daily_log',
        'project_schedules' => 'schedule',
        'project_timeline_extensions' => 'extension',
        'project_warranty_claims' => 'warranty_claim',
        'professional_portfolios' => 'portfolio',
        'arsiteks' => 'arsitek',
        'kontraktors' => 'kontraktor',
        'notaris_profiles' => 'notaris',
        'project_managers' => 'pm',
        'structural_engineers' => 'structural',
        'mep_engineers' => 'mep',
        'suppliers_profiles' => 'supplier',
    ];

    public function __construct(private readonly Fixture $fixture) {}

    /**
     * The request body for a set of rules.
     *
     * @param  array<string, list<string>>  $rules
     * @return array<string, mixed>
     */
    public function build(array $rules): array
    {
        $body = [];

        foreach ($rules as $field => $set) {
            // A wildcard field — `images.*` — belongs to its parent.
            if (str_contains($field, '*')) {
                continue;
            }

            $value = $this->valueFor($field, $set, $rules);

            if ($value === null) {
                continue;
            }

            $body[$field] = $value;
        }

        return $body;
    }

    /**
     * The value for one field, or null when there is none to give it.
     *
     * @param  array<string, list<string>>  $rules
     */
    private function valueFor(string $field, array $set, array $rules): mixed
    {
        // The rules arrive as they are WRITTEN — one string per field, with
        // the rules separated by a pipe: `'required|numeric|min:1'`. They
        // are split here, once, and everything below works on the parts.
        $parts = [];

        foreach ($set as $rule) {
            foreach (explode('|', trim((string) $rule, "'\" ")) as $part) {
                $part = trim($part);

                if ($part !== '') {
                    $parts[] = $part;
                }
            }
        }

        $set = $parts;

        $required = in_array('required', $set, true);
        $nullable = in_array('nullable', $set, true);
        $sometimes = in_array('sometimes', $set, true);

        // A field that is neither required nor present is optional, and an
        // optional field is left out — the request is the SMALLEST one the
        // endpoint accepts.
        if (! $required) {
            if ($nullable || $sometimes || $set === []) {
                return null;
            }

            // A field with rules but no `required` is still validated when
            // it is present, so it is only given a value when it is one
            // the rules can accept. It is left out otherwise.
            return null;
        }

        // A FILE. The capture sends JSON, and a file needs a multipart
        // body — so the field is left out and the endpoint says what it
        // wants.
        foreach (['file', 'image', 'mimes'] as $rule) {
            if (in_array($rule, $set, true)) {
                return null;
            }
        }

        return $this->synthesise($field, $set, $rules);
    }

    /**
     * The value for a required field.
     *
     * @param  array<string, list<string>>  $rules
     */
    private function synthesise(string $field, array $set, array $rules): mixed
    {
        // THE OPTIONS. `in:a,b,c` says exactly what is acceptable.
        foreach ($set as $rule) {
            if (str_starts_with($rule, 'in:')) {
                $options = explode(',', substr($rule, 3));
                $first = trim($options[0]);

                if ($first === '') {
                    continue;
                }

                return $this->coerce($first, $set);
            }
        }

        // A ROW THAT HAS TO EXIST.
        foreach ($set as $rule) {
            if (str_starts_with($rule, 'exists:')) {
                $parts = explode(',', substr($rule, 7));
                $table = $parts[0] ?? '';

                $entity = self::TABLE_ENTITIES[$table] ?? null;

                if ($entity !== null) {
                    return $this->fixture->id($entity);
                }

                return null;
            }
        }

        // A VALUE THAT HAS NOT BEEN USED.
        foreach ($set as $rule) {
            if (str_starts_with($rule, 'unique:')) {
                $parts = explode(',', substr($rule, 7));
                $column = $parts[1] ?? 'id';

                if (str_contains($column, 'email')) {
                    return 'capture-'.$field.'@example.test';
                }

                return 'capture-'.$field;
            }
        }

        // A CONFIRMED FIELD. The two must be equal.
        foreach ($set as $rule) {
            if (str_starts_with($rule, 'confirmed')) {
                $other = $rules['password_confirmation'] ?? $rules['password_confirmation'] ?? null;

                if (is_array($other) && $other !== []) {
                    return $this->valueFor('password_confirmation', $other, $rules);
                }

                return 'capture-'.$field;
            }
        }

        // A FIELD THAT MUST EQUAL ANOTHER.
        foreach ($set as $rule) {
            if (str_starts_with($rule, 'same:')) {
                $other = substr($rule, 5);

                if (isset($rules[$other])) {
                    return $this->valueFor($other, $rules[$other], $rules);
                }

                return 'capture-'.$field;
            }
        }

        // A NUMBER.
        if (in_array('integer', $set, true) || in_array('numeric', $set, true)) {
            return $this->number($set);
        }

        // A BOOLEAN.
        if (in_array('boolean', $set, true)) {
            return true;
        }

        // AN EMAIL.
        if (in_array('email', $set, true)) {
            return 'capture-'.$field.'@example.test';
        }

        // A DATE.
        foreach ($set as $rule) {
            if ($rule === 'date' || str_starts_with($rule, 'date_format:') || str_starts_with($rule, 'after:') || str_starts_with($rule, 'before:')) {
                return $this->date($set);
            }
        }

        // A URL.
        if (in_array('url', $set, true)) {
            return 'https://example.test/capture';
        }

        // A UUID.
        if (in_array('uuid', $set, true)) {
            return '00000000-0000-4000-8000-000000000000';
        }

        // AN ARRAY.
        if (in_array('array', $set, true)) {
            return [];
        }

        // A JSON STRING. The application does `json_decode($request->x,
        // true)`, so the value has to be a STRING of JSON, not an object.
        if (in_array('json', $set, true)) {
            return '{}';
        }

        // A STRING. The value is the field's own name, trimmed to the
        // maximum and padded to the minimum.
        return $this->string($field, $set);
    }

    /**
     * Coerce an `in:` option to the type the other rules imply.
     *
     * @param  list<string>  $set
     */
    private function coerce(string $value, array $set): mixed
    {
        if (in_array('integer', $set, true) && ctype_digit($value)) {
            return (int) $value;
        }

        if (in_array('numeric', $set, true) && is_numeric($value)) {
            return (float) $value;
        }

        if (in_array('boolean', $set, true) && in_array($value, ['true', 'false', '0', '1'], true)) {
            return $value === 'true' || $value === '1';
        }

        return $value;
    }

    /**
     * A number that satisfies the bounds.
     *
     * @param  list<string>  $set
     */
    private function number(array $set): int|float
    {
        $minimum = 1;

        foreach ($set as $rule) {
            if (str_starts_with($rule, 'min:')) {
                $minimum = max($minimum, (int) substr($rule, 4));
            }

            if (str_starts_with($rule, 'gt:')) {
                $minimum = max($minimum, (int) substr($rule, 3) + 1);
            }
        }

        return in_array('integer', $set, true) ? $minimum : (float) $minimum;
    }

    /**
     * A date that satisfies the bounds.
     *
     * @param  list<string>  $set
     */
    private function date(array $set): string
    {
        $date = '2026-06-01 00:00:00';

        foreach ($set as $rule) {
            if (str_starts_with($rule, 'after:')) {
                $after = substr($rule, 6);

                if (strtotime($after) !== false && strtotime($after) >= strtotime($date)) {
                    $date = date('Y-m-d H:i:s', strtotime($after) + 86400);
                }
            }
        }

        return $date;
    }

    /**
     * A string that satisfies the length bounds.
     *
     * @param  list<string>  $set
     */
    private function string(string $field, array $set): string
    {
        $value = 'capture-'.$field;

        foreach ($set as $rule) {
            if (str_starts_with($rule, 'max:')) {
                $max = (int) substr($rule, 4);

                if ($max > 0 && strlen($value) > $max) {
                    $value = substr($value, 0, $max);
                }
            }
        }

        foreach ($set as $rule) {
            if (str_starts_with($rule, 'min:')) {
                $min = (int) substr($rule, 4);

                while (strlen($value) < $min) {
                    $value .= 'x';
                }
            }
        }

        return $value;
    }
}
