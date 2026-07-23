import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const stats = [
  { label: 'Active users', value: '1.2k' },
  { label: 'Conversion', value: '7.4%' },
  { label: 'Revenue', value: '$18.3k' },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Protected area</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome to your dashboard</h1>
          <p className="max-w-2xl text-muted-foreground">
            This is the place to build your product-specific screens, charts, and workflows.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border shadow-sm">
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-2xl">{stat.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
            <CardDescription>
              Add your own tables, analytics widgets, or profile views here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Keep the structure clean by putting route-specific components under the app folders and shared features under the components and lib directories.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
