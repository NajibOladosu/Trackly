import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ApplyKitScreen } from "@/modules/applications/components/apply-kit/apply-kit-screen"

export const dynamic = "force-dynamic"

export default function ApplyPage() {
  return (
    <DashboardLayout>
      <ApplyKitScreen />
    </DashboardLayout>
  )
}
