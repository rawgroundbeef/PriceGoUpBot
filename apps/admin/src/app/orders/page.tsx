import OrdersTable from "../../components/OrdersTable";

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Orders</h1>
        </div>
        <OrdersTable />
      </div>
    </div>
  );
}


