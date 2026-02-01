import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-muted-foreground">Content coming soon.</p>
      </CardContent>
    </Card>
  );
}
