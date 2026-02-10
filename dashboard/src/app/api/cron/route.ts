
import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { v4 as uuidv4 } from "uuid"

const CRON_FILE = path.join(process.cwd(), "..", "config", "cron.json")

// GET /api/cron - List all jobs
export async function GET() {
  try {
    try {
        const data = await fs.readFile(CRON_FILE, "utf-8")
        const jobs = JSON.parse(data)
        return NextResponse.json({ jobs, count: jobs.length })
    } catch (e) {
        // If file doesn't exist, return empty list
        return NextResponse.json({ jobs: [], count: 0 })
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch cron jobs" }, { status: 500 })
  }
}

// POST /api/cron - Create new job
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, schedule, command, description, enabled } = body

    if (!name || !schedule || !command) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    let jobs = []
    try {
        const data = await fs.readFile(CRON_FILE, "utf-8")
        jobs = JSON.parse(data)
    } catch {}

    const newJob = {
        id: uuidv4(),
        name,
        schedule,
        command,
        description: description || "",
        enabled: enabled ?? true
    }

    jobs.push(newJob)
    await fs.writeFile(CRON_FILE, JSON.stringify(jobs, null, 2))

    return NextResponse.json({ success: true, job: newJob })
  } catch (error) {
    return NextResponse.json({ error: "Failed to create cron job" }, { status: 500 })
  }
}
