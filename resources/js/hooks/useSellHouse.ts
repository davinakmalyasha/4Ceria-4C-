import { useState } from 'react';
import axios from 'axios';

export interface RoomEntry {
    name: string;
    type: string;
    width: string;
    length: string;
    desc: string;
    pics: File[] | null;
}

interface HouseFormData {
    name: string;
    price: string;
    house_desc: string;
    width: string;
    length: string;
    ba: string;
    br: string;
    floors: string;
    street_name: string;
    kelurahan: string;
    kecamatan: string;
    kab_kota: string;
    province: string;
    postal_code: string;
    lat: string;
    lng: string;
    house_pic: File[] | null;
    rooms: RoomEntry[];
}

export function useSellHouse(onSuccess: () => void) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const initialData: HouseFormData = {
        name: '', price: '', house_desc: '', width: '', length: '', ba: '', br: '', floors: '1',
        street_name: '', kelurahan: '', kecamatan: '', kab_kota: '', province: '', postal_code: '',
        lat: '-6.2088', lng: '106.8456', house_pic: null,
        rooms: []
    };

    const [formData, setFormData] = useState<HouseFormData>(initialData);

    const handleChange = (field: keyof HouseFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const payload = new FormData();
            
            // Handle regular fields
            Object.entries(formData).forEach(([key, value]) => {
                if (key === 'house_pic') {
                    if (value) {
                        (value as File[]).forEach((file, index) => {
                            payload.append(`house_pic[${index}]`, file);
                        });
                    }
                } else if (key === 'rooms') {
                    (value as RoomEntry[]).forEach((room, index) => {
                        payload.append(`rooms[${index}][name]`, room.name);
                        payload.append(`rooms[${index}][type]`, room.type);
                        payload.append(`rooms[${index}][width]`, room.width);
                        payload.append(`rooms[${index}][length]`, room.length);
                        payload.append(`rooms[${index}][desc]`, room.desc || '');
                        if (room.pics && room.pics.length > 0) {
                            room.pics.forEach((file, picIndex) => {
                                payload.append(`rooms[${index}][pics][${picIndex}]`, file);
                            });
                        }
                    });
                } else if (value !== null && value !== '') {
                    const finalVal = key === 'price' ? String(value).replace(/\D/g, '') : value;
                    payload.append(key, finalVal as string);
                }
            });

            await axios.post('/houses', payload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onSuccess();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to submit property.');
        } finally {
            setIsLoading(false);
        }
    };

    return { formData, handleChange, setFormData, submit, isLoading, error };
}
