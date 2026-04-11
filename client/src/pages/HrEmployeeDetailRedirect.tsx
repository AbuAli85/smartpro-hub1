import { useEffect } from "react";
import { useLocation, useParams } from "wouter";

/** Maps legacy `/hr/employees/:id` links (e.g. notifications) to workforce employee detail. */
export default function HrEmployeeDetailRedirect() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  useEffect(() => {
    const id = params.id;
    if (id) navigate(`/workforce/employees/${id}`, { replace: true });
  }, [params.id, navigate]);
  return null;
}
