
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

const CRON_FILE = path.join(process.cwd(), "..", "config", "cron.json")

// POST /api/cron/[id] - Update job (Using POST for simplicity, could be PUT)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    let jobs = []
    try {
        const data = await fs.readFile(CRON_FILE, "utf-8")
        jobs = JSON.parse(data)
    } catch {
        return NextResponse.json({ error: "Cron config not found" }, { status: 404 })
    }

    const index = jobs.findIndex((j: any) => j.id === id)
    if (index === -1) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Update fields
    jobs[index] = { ...jobs[index], ...body }
    
    await fs.writeFile(CRON_FILE, JSON.stringify(jobs, null, 2))

    return NextResponse.json({ success: true, job: jobs[index] })
  } catch (error) {
    return NextResponse.json({ error: "Failed to update cron job" }, { status: 500 })
  }
}

// DELETE /api/cron/[id] - Delete job
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    let jobs = []
    try {
        const data = await fs.readFile(CRON_FILE, "utf-8")
        jobs = JSON.parse(data)
    } catch {
        return NextResponse.json({ error: "Cron config not found" }, { status: 404 })
    }

    const newJobs = jobs.filter((j: any) => j.id !== id)
    
    await fs.writeFile(CRON_FILE, JSON.stringify(newJobs, null, 2))

    return NextResponse.json({ success: true, message: "Job deleted" })
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete cron job" }, { status: 500 })
  }
}
