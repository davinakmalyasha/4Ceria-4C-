<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    public function contactList()
    {
        $contacts = Contact::all();

        return view('contact.contact-list', compact('contacts'));
    }

    public function contactView($id)
    {
        $contact = Contact::find($id);

        return view('contact.contact-view', compact('contact'));
    }

    public function contactCreateForm()
    {
        return view('contact.contact-create');
    }

    public function contactCreate(Request $request)
    {
        $request->validate([
            'name' => ['required', 'max:30', 'string'],
            'url' => ['required', 'max:255', 'string'],
            'banner' => ['required', 'file', 'max:2048', 'mimes:png,jpg,jpeg'],
        ]);
        if ($request->hasFile('banner') && $request->file('banner')->isValid()) {
            $saveFolder = 'uploads/contact/banner/'.$request->name;
            $path = $request->file('banner')->store($saveFolder, 'public');
            Contact::create([
                'name' => $request->name,
                'url' => $request->url,
                'banner_dir' => $path,
                'size' => $request->file('banner')->getSize(),
            ]);

            return redirect()->route('contact.list')->with('success', 'File Uploaded Succesfully');
        } else {
            return redirect()->route('contact.list')->with('error', 'File failed to upload');
        }
    }

    public function contactEdit(Request $request, $id)
    {
        $request->validate([
            'name' => ['required', 'max:30', 'string'],
            'url' => ['required', 'max:255', 'string'],
            'banner' => ['nullable', 'file', 'max:2048', 'mimes:png,jpg,jpeg'],
        ]);
        $contact = Contact::findOrFail($id);
        // If a file is uploaded, store it and get the path
        if ($request->hasFile('banner')) {
            $path = $request->file('banner')->store('public/banners');
        } else {
            // If no new file is uploaded, you can use the old file path or leave it unchanged
            $path = $contact->banner_dir;
        }

        // Save the contact
        $contact->name = $request->name;
        $contact->url = $request->url;
        $contact->banner_dir = $path;
        $contact->save();

        return redirect()->route('contact.list');
    }
}
