<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProjectRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|string',
            'budget' => 'sometimes|numeric|min:0',
            'lokasi' => 'sometimes|string|max:255',
            'latitude' => 'nullable|string',
            'longitude' => 'nullable|string',
            'province' => 'nullable|string',
            'city' => 'nullable|string',
            'kecamatan' => 'nullable|string',
            'kelurahan' => 'nullable|string',
            'postal_code' => 'nullable|string',
            'street_name' => 'nullable|string',
            'status' => 'sometimes|string|in:open,in_progress,completed,cancelled',
            'target_role' => 'sometimes|string|in:both,arsitek,kontraktor',
            'deadline' => 'sometimes|date',
            'images.*' => 'sometimes|file|mimes:jpg,jpeg,png|max:5120',
            'deleted_images' => 'sometimes|array',
            'deleted_images.*' => 'integer',
            'design_details' => 'nullable|array',
            'construction_details' => 'nullable|array',
            'interior_details' => 'nullable|array',
            'completed_phases' => 'nullable|array',
            'wants_project_manager' => 'sometimes',
            'requires_structural' => 'sometimes',
            'requires_mep' => 'sometimes',
            'negotiated_fee' => 'nullable|numeric|min:0',
            'payment_instructions' => 'nullable|string',
            'payment_termins' => 'nullable|array',
            'payment_termins.*.label' => 'required|string',
            'payment_termins.*.percentage' => 'required|numeric',
            'payment_termins.*.amount' => 'required|numeric',
            'payment_termins.*.notes' => 'nullable|string|max:250',
            'legal_requirements' => 'nullable|array',
            'legal_requirements.*' => 'string',
            'needed_phases' => 'nullable|string', // JSON array of design,build,interior,legal
        ];
    }
}
