import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';

const stats = [
  { label: 'Active users', value: '1.2k' },
  { label: 'Conversion', value: '7.4%' },
  { label: 'Revenue', value: '$18.3k' },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
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
    </>
  );
}
