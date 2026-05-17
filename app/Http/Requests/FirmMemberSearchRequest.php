<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class FirmMemberSearchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role_type, ['arsitek', 'kontraktor']);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'query' => ['required', 'string', 'min:2', 'max:50'],
            'sort'  => ['nullable', 'in:a-z,z-a'],
        ];
    }
}
