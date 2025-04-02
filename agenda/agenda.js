import Agenda from 'agenda';
import CalendarController from '../controllers/CalendarController.js'
// import { users } from './userStore'; // a list of registered user emails

const mongoConnectionString = process.env.MONGO_DB_URL;
const agenda = new Agenda({ db: { address: mongoConnectionString, collection: 'agendaJobs' } });

export const isAlreadyScheduled = async (agenda, email, event) => {
    const existingJobs = await agenda.jobs({
        name: 'notify user of event',
        'data.email': email,
        'data.event.id': event.id
    });
    return existingJobs.length > 0;
};

export const setupAgenda = async (io) => {
    const agenda = new Agenda({
        db: {
            address: mongoConnectionString,
            collection: 'agendaJobs',
        },
    });

    agenda.define('notify user of event', async (job) => {
        const { email, event } = job.attrs.data;
        io.to(email).emit('eventNotification', {
            title: event.summary,
            time: event.start
        });
    });

    agenda.define('schedule daily events', async () => {
        for (const email of users) {
            const events = await getTodaysEventsForUser(email);
            for (const event of events) {
                if (!(await isAlreadyScheduled(agenda, email, event))) {
                    try {
                        await agenda.schedule(new Date(event.start), 'notify user of event', { email, event });
                    } catch (err) {
                        console.error(`❌ Failed to schedule event for ${email}:`, err);
                    }
                }
            }
        }
    });

    await agenda.start(); // ✅ Wait for Agenda to initialize before scheduling
    await agenda.every('1 hour', 'schedule daily events'); // Safe now

    console.log("✅ Agenda initialized and scheduled tasks");
    return agenda;
};