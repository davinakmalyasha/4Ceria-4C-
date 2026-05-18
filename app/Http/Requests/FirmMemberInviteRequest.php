<?php

namespace App\Http\Requests;

use App\Models\ContractorSubspecialty;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class FirmMemberInviteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role_type, ['arsitek', 'kontraktor']);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $validRoles = $this->getValidRoles();

        return [
            'member_user_id'  => ['required', 'integer', Rule::exists('users', 'id')],
            'roles_in_firm'   => ['required', 'array', 'min:1'],
            'roles_in_firm.*' => ['required', 'string', 'max:50', Rule::in($validRoles)],
        ];
    }

    /** @return string[] */
    private function getValidRoles(): array
    {
        if ($this->user()?->role_type === 'arsitek') {
            return ['structural', 'mep', 'interior'];
        }

        return ContractorSubspecialty::pluck('slug')->toArray();
    }
}
