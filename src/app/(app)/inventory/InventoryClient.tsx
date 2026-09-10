"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createProduct,
  createLocation,
  addStock,
  deleteProduct,
  deleteLocation,
  removeStock,
} from "@/modules/inventory/actions";
import { Scan } from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string | null;
  lowStockAt: number;
  stockItems: {
    id: string;
    quantity: number;
    expiryDate: Date | null;
    location: { name: string } | null;
  }[];
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
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false),
    );
  }, [products, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-zinc-500">{t("subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => setScanning(true)}>
          <Scan className="mr-2 h-4 w-4" />
          {t("scanBarcode")}
        </Button>
      </div>

      {scanning && (
        <BarcodeScanner
          onScan={(code) => {
            setBarcode(code);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}

      <CollapsibleCreate
        openLabel={t("addProduct")}
        cancelLabel={tc("cancelAdd")}
        defaultOpen={products.length === 0}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("addProduct")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createProduct} className="space-y-3">
                <div>
                  <Label>{tc("name")}</Label>
                  <Input name="name" required />
                </div>
                <div>
                  <Label>{tc("category")}</Label>
                  <Input name="category" />
                </div>
                <div>
                  <Label>{tc("quantity")}</Label>
                  <Input name="quantity" type="number" min="0" defaultValue="1" />
                </div>
                <div>
                  <Label>{t("lowStockThreshold")}</Label>
                  <Input name="lowStockAt" type="number" min="0" defaultValue="1" />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="autoAddWhenLowStock"
                    id="autoAddWhenLowStock"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <Label htmlFor="autoAddWhenLowStock">{t("autoAddShopping")}</Label>
                </div>
                <div>
                  <Label>{t("barcode")}</Label>
                  <Input
                    name="barcode"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{tc("location")}</Label>
                  <select
                    name="locationId"
                    className="flex h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
                  >
                    <option value="">{tc("noneOption")}</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t("expiryDate")}</Label>
                  <Input name="expiryDate" type="date" />
                </div>
                <Button type="submit">{t("addProductBtn")}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("addLocation")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={createLocation} className="flex gap-2">
                <Input name="name" placeholder={t("locationPlaceholder")} required />
                <Button type="submit">{tc("add")}</Button>
              </form>
              {locations.length === 0 ? (
                <EmptyState message={t("noLocations")} />
              ) : (
                <ul className="space-y-2">
                  {locations.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span>{l.name}</span>
                      <ConfirmForm
                        action={deleteLocation}
                        message={t("confirmDeleteLocation")}
                      >
                        <input type="hidden" name="id" value={l.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          {tc("delete")}
                        </Button>
                      </ConfirmForm>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </CollapsibleCreate>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">
            {t("products", { count: products.length })}
          </CardTitle>
          {products.length > 0 && (
            <Input
              placeholder={t("searchProducts")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <EmptyState message={t("noProducts")} />
          ) : filtered.length === 0 ? (
            <EmptyState message={t("noMatch")} />
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => {
                const total = p.stockItems.reduce((s, i) => s + i.quantity, 0);
                const low = total <= p.lowStockAt;
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-4 ${
                      low
                        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
                        : ""
                    }`}
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.category && (
                          <p className="text-sm text-zinc-500">{p.category}</p>
                        )}
                        <p className="text-sm">
                          {t("stock", { total, threshold: p.lowStockAt })}
                        </p>
                        {p.barcodes.length > 0 && (
                          <p className="text-xs text-zinc-400">
                            {t("barcodeLabel", {
                              codes: p.barcodes.map((b) => b.code).join(", "),
                            })}
                          </p>
                        )}
                      </div>
                      <ConfirmForm
                        action={deleteProduct}
                        message={t("confirmDeleteProduct")}
                      >
                        <input type="hidden" name="id" value={p.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          {tc("delete")}
                        </Button>
                      </ConfirmForm>
                    </div>
                    {p.stockItems.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {p.stockItems.map((stock) => (
                          <li
                            key={stock.id}
                            className="flex items-center justify-between text-xs text-zinc-500"
                          >
                            <span>
                              {stock.quantity}
                              {stock.location ? ` @ ${stock.location.name}` : ""}
                            </span>
                            <ConfirmForm
                              action={removeStock}
                              message={t("confirmRemoveStock")}
                            >
                              <input type="hidden" name="id" value={stock.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                {t("removeStock")}
                              </Button>
                            </ConfirmForm>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form action={addStock} className="mt-3 flex flex-wrap gap-2">
                      <input type="hidden" name="productId" value={p.id} />
                      <Input
                        name="quantity"
                        type="number"
                        min="1"
                        defaultValue="1"
                        className="w-20"
                      />
                      <select
                        name="locationId"
                        className="h-10 rounded-md border border-zinc-300 px-2 text-sm"
                      >
                        <option value="">{tc("location")}</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <Input name="expiryDate" type="date" className="w-40" />
                      <Button type="submit" size="sm">
                        {t("addStock")}
                      </Button>
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
