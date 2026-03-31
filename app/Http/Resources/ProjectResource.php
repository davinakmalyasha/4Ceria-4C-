<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'budget' => $this->budget,
            'location' => $this->lokasi,
            'type' => $this->jenis_proyek,
            'status' => $this->status,
            'deadline' => $this->deadline,
            'attachment' => $this->attachment,
            'owner_id' => $this->user_id,
            'selected_architect_id' => $this->selected_arsitek_id,
            'selected_contractor_id' => $this->selected_kontraktor_id,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'images' => $this->whenLoaded('images', function () {
                return $this->images->map(fn ($img) => [
                    'id' => $img->id,
                    'url' => asset('storage/' . $img->image_path),
                    'sort_order' => $img->sort_order,
                ]);
            }),
            'bids_arsitek' => $this->whenLoaded('bidsArsitek', function () {
                return $this->bidsArsitek->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'created_at' => $bid->created_at,
                        'bidder' => $bid->arsitek ? [
                            'id' => $bid->arsitek->id,
                            'name' => $bid->arsitek->nama,
                            'phone' => $bid->arsitek->no_telp,
                            'specialization' => $bid->arsitek->spesialisasi,
                            'experience_years' => $bid->arsitek->pengalaman_tahun,
                            'rate' => $bid->arsitek->rate_harga,
                            'location' => $bid->arsitek->lokasi,
                            'user' => $bid->arsitek->user ? [
                                'name' => $bid->arsitek->user->name,
                                'email' => $bid->arsitek->user->email,
                            ] : null,
                        ] : null,
                    ];
                });
            }),
            'bids_kontraktor' => $this->whenLoaded('bidsKontraktor', function () {
                return $this->bidsKontraktor->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'created_at' => $bid->created_at,
                        'bidder' => $bid->kontraktor ? [
                            'id' => $bid->kontraktor->id,
                            'name' => $bid->kontraktor->nama,
                            'phone' => $bid->kontraktor->no_telp,
                            'location' => $bid->kontraktor->lokasi,
                            'user' => $bid->kontraktor->user ? [
                                'name' => $bid->kontraktor->user->name,
                                'email' => $bid->kontraktor->user->email,
                            ] : null,
                        ] : null,
                    ];
                });
            }),
        ];
    }
}
