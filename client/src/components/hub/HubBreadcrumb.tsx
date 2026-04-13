import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";
import { Link } from "wouter";

export type HubCrumb = { label: string; href?: string };

export function HubBreadcrumb({ items }: { items: HubCrumb[] }) {
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList className="flex-wrap gap-y-1">
        {items.map((crumb, i) => (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
