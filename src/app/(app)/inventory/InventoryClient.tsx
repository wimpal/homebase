"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { createProduct, createLocation, addStock } from "@/modules/inventory/actions";
import { Scan } from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string | null;
  lowStockAt: number;
  stockItems: { id: string; quantity: number; expiryDate: Date | null; location: { name: string } | null }[];
  barcodes: { code: string }[];
}

interface Location {
  id: string;
  name: string;
}

export function InventoryClient({
  products,
  locations,
}: {
  products: Product[];
  locations: Location[];
}) {
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-zinc-500">Track products and stock levels</p>
        </div>
        <Button variant="outline" onClick={() => setScanning(true)}>
          <Scan className="mr-2 h-4 w-4" />
          Scan Barcode
        </Button>
      </div>

      {scanning && (
        <BarcodeScanner
          onScan={(code) => { setBarcode(code); setScanning(false); }}
          onClose={() => setScanning(false)}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Add Product</CardTitle></CardHeader>
          <CardContent>
            <form action={createProduct} className="space-y-3">
              <div><Label>Name</Label><Input name="name" required /></div>
              <div><Label>Category</Label><Input name="category" /></div>
              <div><Label>Quantity</Label><Input name="quantity" type="number" min="0" defaultValue="1" /></div>
              <div><Label>Low stock threshold</Label><Input name="lowStockAt" type="number" min="0" defaultValue="1" /></div>
              <div><Label>Barcode</Label><Input name="barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} /></div>
              <div>
                <Label>Location</Label>
                <select name="locationId" className="flex h-10 w-full rounded-md border border-zinc-300 px-3 text-sm">
                  <option value="">None</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div><Label>Expiry date</Label><Input name="expiryDate" type="date" /></div>
              <Button type="submit">Add Product</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Add Location</CardTitle></CardHeader>
          <CardContent>
            <form action={createLocation} className="flex gap-2">
              <Input name="name" placeholder="Pantry, Fridge..." required />
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Products ({products.length})</CardTitle></CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-zinc-500">No products yet.</p>
          ) : (
            <div className="space-y-3">
              {products.map((p) => {
                const total = p.stockItems.reduce((s, i) => s + i.quantity, 0);
                const low = total <= p.lowStockAt;
                return (
                  <div key={p.id} className={`rounded-lg border p-4 ${low ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" : ""}`}>
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.category && <p className="text-sm text-zinc-500">{p.category}</p>}
                        <p className="text-sm">Stock: {total} (low at {p.lowStockAt})</p>
                        {p.barcodes.length > 0 && (
                          <p className="text-xs text-zinc-400">Barcode: {p.barcodes.map((b) => b.code).join(", ")}</p>
                        )}
                      </div>
                    </div>
                    <form action={addStock} className="mt-3 flex flex-wrap gap-2">
                      <input type="hidden" name="productId" value={p.id} />
                      <Input name="quantity" type="number" min="1" defaultValue="1" className="w-20" />
                      <select name="locationId" className="h-10 rounded-md border border-zinc-300 px-2 text-sm">
                        <option value="">Location</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                      <Input name="expiryDate" type="date" className="w-40" />
                      <Button type="submit" size="sm">Add Stock</Button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
