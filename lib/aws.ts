import { ECS } from '@aws-sdk/client-ecs';
import { Agent } from '../schemas';

const ecs = new ECS({
    region: process.env.AWS_REGION || 'us-east-1'
});

const ECS_CLUSTER = process.env.ECS_CLUSTER || 'default';
const ECS_SERVICE = process.env.ECS_SERVICE || 'prod-eliza-agents-service';

export async function setTaskCountToActiveAgents(): Promise<void> {
    try {
        // Count all non-deleted agents
        const activeAgentCount = await Agent.countDocuments({
            deletedAt: null
        });

        // Update the service with new desired count
        await ecs.updateService({
            cluster: ECS_CLUSTER,
            service: ECS_SERVICE,
            desiredCount: activeAgentCount
        });

        console.log(`Updated ECS service task count to ${activeAgentCount} based on active agents`);
    } catch (error) {
        console.error('Error adjusting task count:', error);
        throw error;
    }
}

export async function adjustTaskCount(adjustment: number): Promise<void> {
    try {
        // Get current service details
        const service = await ecs.describeServices({
            cluster: ECS_CLUSTER,
            services: [ECS_SERVICE]
        });

        if (!service.services || service.services.length === 0) {
            throw new Error('Service not found');
        }

        const currentCount = service.services[0].desiredCount || 0;
        const newCount = Math.max(0, currentCount + adjustment); // Prevent negative task count

        // Update the service with new desired count
        await ecs.updateService({
            cluster: ECS_CLUSTER,
            service: ECS_SERVICE,
            desiredCount: newCount
        });
    } catch (error) {
        console.error('Error adjusting task count:', error);
        throw error;
    }
}

export async function stopEcsTask(taskId: string): Promise<void> {
    try {
        await ecs.stopTask({
            cluster: ECS_CLUSTER,
            task: taskId,
            reason: 'Agent updated'
        });
        console.log(`Stopped ECS task: ${taskId}`);
    } catch (error) {
        console.error('Error stopping ECS task:', error);
        throw error;
    }
}
