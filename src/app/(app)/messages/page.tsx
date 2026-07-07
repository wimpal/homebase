import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getMessages,
  sendMessage,
  getRequests,
  createRequest,
  updateRequestStatus,
} from "@/modules/social/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { MessageSquare, ShoppingCart, Wrench } from "lucide-react";

export default async function MessagesPage() {
  const { role, householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.MESSAGING);
  const [messages, requests] = await Promise.all([getMessages(), getRequests()]);
  const isAdmin = role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-zinc-500">Household chat and requests</p>
      </div>

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">Group Chat</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Send Message</CardTitle></CardHeader>
            <CardContent>
              <form action={sendMessage} className="flex gap-2">
                <Textarea name="content" placeholder="Message the household..." required className="flex-1" />
                <Button type="submit">Send</Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {messages.map((msg) => (
              <Card key={msg.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">{msg.user.name}</span>
                    <span className="text-xs text-zinc-400">{new Date(msg.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-sm">{msg.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">New Request</CardTitle></CardHeader>
            <CardContent>
              <form action={createRequest} className="space-y-3">
                <div>
                  <Label>Type</Label>
                  <select name="type" className="flex h-10 w-full rounded-md border px-3 text-sm">
                    <option value="GROCERY">Grocery</option>
                    <option value="TASK">Task</option>
                  </select>
                </div>
                <div><Label>Title</Label><Input name="title" required /></div>
                <div><Label>Description</Label><Textarea name="description" /></div>
                <Button type="submit">Submit Request</Button>
              </form>
            </CardContent>
          </Card>

          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {req.type === "GROCERY" ? <ShoppingCart className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                    {req.title}
                  </p>
                  <p className="text-sm text-zinc-500">By {req.user.name} · {req.status}</p>
                  {req.description && <p className="text-sm">{req.description}</p>}
                </div>
                {isAdmin && req.status === "PENDING" && (
                  <div className="flex gap-1">
                    <form action={updateRequestStatus}>
                      <input type="hidden" name="id" value={req.id} />
                      <input type="hidden" name="status" value="APPROVED" />
                      <Button type="submit" size="sm">Approve</Button>
                    </form>
                    <form action={updateRequestStatus}>
                      <input type="hidden" name="id" value={req.id} />
                      <input type="hidden" name="status" value="REJECTED" />
                      <Button type="submit" size="sm" variant="outline">Reject</Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
