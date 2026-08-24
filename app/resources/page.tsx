"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { BookOpen } from "lucide-react"
import { GlossaryView } from "@/modules/resources/components/GlossaryView"
import { OutreachTemplatesView } from "@/modules/resources/components/OutreachTemplatesView"

export default function ResourcesPage() {
  const [tab, setTab] = useState("glossary")

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-primary" />
            Resources
          </h1>
          <p className="text-muted-foreground mt-2">
            Reference material to speed up your job search.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="glossary">Glossary</TabsTrigger>
            <TabsTrigger value="outreach">Outreach Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="glossary" className="mt-6">
            <GlossaryView />
          </TabsContent>

          <TabsContent value="outreach" className="mt-6">
            <OutreachTemplatesView />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
