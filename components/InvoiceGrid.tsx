"use client";
import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const money = (c: string) => (p: any) =>
  p.value == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: p.data?.currency || c }).format(p.value);

export default function InvoiceGrid({ rows, currency }: { rows: any[]; currency: string }) {
  const [quick, setQuick] = useState("");
  const cols = useMemo<ColDef[]>(
    () => [
      { field: "number", headerName: "Invoice", width: 110 },
      { field: "client", headerName: "Client", flex: 1.3, minWidth: 160 },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        cellStyle: (p: any) =>
          p.value === "PAID" || p.value === "MARKED_AS_PAID"
            ? { color: "#067647", fontWeight: 600 }
            : p.data?.daysOverdue > 0
            ? { color: "#b42318", fontWeight: 600 }
            : { color: "#b54708", fontWeight: 600 },
      },
      { field: "amount", headerName: "Amount", type: "numericColumn", valueFormatter: money(currency), width: 120 },
      { field: "due", headerName: "Still due", type: "numericColumn", valueFormatter: money(currency), width: 120 },
      { field: "dueDate", headerName: "Due date", width: 125 },
      {
        field: "daysOverdue",
        headerName: "Days overdue",
        type: "numericColumn",
        width: 135,
        cellStyle: (p: any) => (p.value > 21 ? { color: "#b42318", fontWeight: 700 } : p.value > 0 ? { color: "#b54708", fontWeight: 600 } : null),
      },
      { field: "paidDate", headerName: "Paid on", width: 125 },
      { field: "daysLate", headerName: "Paid days late", type: "numericColumn", width: 150 },
    ],
    [currency]
  );

  return (
    <div>
      <div className="gridtools">
        <input aria-label="Search invoices" placeholder="Search invoices or clients" value={quick} onChange={(e) => setQuick(e.target.value)} />
      </div>
      <div className="gridbox">
        <AgGridReact
          rowData={rows}
          columnDefs={cols}
          quickFilterText={quick}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination
          paginationPageSize={10}
          animateRows={false}
        />
      </div>
    </div>
  );
}
